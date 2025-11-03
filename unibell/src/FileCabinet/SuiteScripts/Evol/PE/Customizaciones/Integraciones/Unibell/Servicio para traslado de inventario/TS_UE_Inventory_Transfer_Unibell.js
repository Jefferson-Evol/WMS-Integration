/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(["N/error", "N/format", "N/log", "N/record", "N/search"]
/**
 * @param{error} error
 * @param{format} format
 * @param{log} log
 * @param{record} record
 * @param{search} search
 */, (error, format, log, record, search) => {
  /**
   * Defines the function definition that is executed before record is loaded.
   * @param {Object} scriptContext
   * @param {Record} scriptContext.newRecord - New record
   * @param {string} scriptContext.type - Trigger type; use values from the context.UserEventType enum
   * @param {Form} scriptContext.form - Current form
   * @param {ServletRequest} scriptContext.request - HTTP request information sent from the browser for a client action only.
   * @since 2015.2
   */

  const afterSubmit = (scriptContext) => {
    try {
      if (
        scriptContext.type === scriptContext.UserEventType.CREATE ||
        scriptContext.type === scriptContext.UserEventType.EDIT ||
        scriptContext.type === scriptContext.UserEventType.COPY
      ) {
        let newRecord = scriptContext.newRecord;

        let recordProvider = record.load({
          type: record.Type.INVENTORYTRANSFER,
          id: newRecord.id,
          isDynamic: true,
        });

        // de manera dinámica
        let jsonDynamic = {
          id: recordProvider.id,
          recordType: recordProvider.type,
          tranid: recordProvider.getValue("tranid"),
          trandate: recordProvider.getValue("trandate"),
          memo: recordProvider.getValue("memo"),
          location: recordProvider.getValue("location"),
          transferlocation: recordProvider.getValue("transferlocation"),
          subsidiary: recordProvider.getValue("subsidiary"),
          department: recordProvider.getValue("department"),
          class: recordProvider.getValue("class"),
          cseg5: recordProvider.getValue("cseg5"),
          custbody_uni_motivo_traslado: recordProvider.getValue(
            "custbody_uni_motivo_traslado"
          ),

          // Campos de item
          item: recordProvider.getValue("item"),
          units: recordProvider.getValue("units"),
          quantityonhand: recordProvider.getValue("quantityonhand"),

          // Detalle de inventario
          inventorynumber: recordProvider.getValue("inventorynumber"), // ISSUEINVENTORYNUMBER
          // Campo valtante de origen
          inventorystatus: recordProvider.getValue("inventorystatus"),
          toinventorystatus: recordProvider.getValue("toinventorystatus"),
          quantity: recordProvider.getValue("quantity"),
        };

        log.audit("JSON a enviar", JSON.stringify(jsonDynamic));

        let config = getUrlServiceDetails();

        const headers = {
          "Content-Type": "application/json",
        };

        if (config.token) headers["Authorization"] = "Bearer " + config.token;

        const protocol = config.url.startsWith("https") ? https : http;

        let response;

        try {
          response = protocol.post({
            url: config.url,
            body: JSON.stringify(jsonDynamic),
            headers,
          });
          log.audit("Respuesta", response.body);
        } catch (httpError) {
          log.error("Error al enviar al servicio", httpError);
        }

        log.audit(
          "Antes de saveRequest",
          response ? "Con respuesta" : "Sin respuesta"
        );

        if (response) {
          saveRequest({
            destination: companiaDestino,
            entity: sistemaDestino,
            method: metodo,
            key: newRecord.id,
            request: jsonDynamic,
            response: response
              ? JSON.parse(response.body || "{}")
              : { status: 0, message: "sin respuesta" },
            status: response ? response.code : "ERR",
          });
        } else {
          log.error(
            "No se generó respuesta del servicio, no se guardará trazabilidad."
          );
        }
      }
    } catch (error) {
      log.error("Error en afterSubmit", error);
    }
  };

  // FUNCIONES
  const getUrlServiceDetails = () => {
    try {
      let res = [];
      let searchObj = search.create({
        type: "customrecord_uni_serv_integ",
        filters: [],
        columns: [
          search.createColumn({ name: "name", label: "Nombre" }),
          search.createColumn({ name: "scriptid", label: "ID de script" }),
          search.createColumn({
            name: "custrecord_uni_serv_integ_link_traslado",
            label: "UNI - Servicio Traslado de Inventario",
          }),
          search.createColumn({
            name: "custrecord_uni_serv_integ_tok_traslado",
            label: "UNI - Token Traslado de Inventario",
          }),
        ],
      });


      let searchResultCount = searchObj.runPaged().count;
      log.debug("searchObj  result count", searchResultCount);

      searchObj.run().each((result) => {
        res.push({
          token: result.getValue("custrecord_uni_serv_integ_tok_traslado"),
          url: result.getValue("custrecord_uni_serv_integ_link_traslado"),
        });
        return true;
      });

      if (res.length !== 1) throw "Error en configuración del servicio";

      return res[0];
    } catch (error) {
      log.error("getUrlServiceDetails", error);
      throw error;
    }
  };

  
  const saveRequest = (params) => {
    try {
      log.audit("saveRequest - Inicio", JSON.stringify(params));

      const req = record.create({
        type: "customrecord_ts_outb_int_log",
        isDynamic: true,
      });
      log.audit("Paso 1", "Registro creado");

      try {
        req.setValue({
          fieldId: "custrecord_ts_outb_int_log_destination",
          value: params.destination,
        });
        req.setValue({
          fieldId: "custrecord_ts_outb_int_log_entity",
          value: params.entity,
        });
        req.setValue({
          fieldId: "custrecord_ts_outb_int_log_method",
          value: params.method,
        });
        req.setValue({
          fieldId: "custrecord_ts_outb_int_log_key",
          value: params.key,
        });
        req.setValue({
          fieldId: "custrecord_ts_outb_int_log_request",
          value: JSON.stringify(params.request),
        });
        req.setValue({
          fieldId: "custrecord_ts_outb_int_log_response",
          value: JSON.stringify(params.response),
        });
        req.setValue({
          fieldId: "custrecord_ts_outb_int_log_status",
          value: params.status,
        });
        log.audit("Paso 2", "Campos seteados correctamente");
      } catch (setErr) {
        log.error("Error al asignar campos", setErr);
      }

      try {
        const idLog = req.save();
        log.audit("Paso 3", "Registro guardado con ID: " + idLog);
      } catch (saveErr) {
        log.error("Error al guardar registro", saveErr);
      }
    } catch (e) {
      log.error("Error general en saveRequest", e);
    }
  };

  return { afterSubmit };
});
