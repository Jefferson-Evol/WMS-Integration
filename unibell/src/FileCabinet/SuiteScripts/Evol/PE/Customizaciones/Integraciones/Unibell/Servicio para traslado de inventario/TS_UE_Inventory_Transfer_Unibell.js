/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(["N/error", "N/format", "N/log", "N/record", "N/search"], /**
 * @param{error} error
 * @param{format} format
 * @param{log} log
 * @param{record} record
 * @param{search} search
 */ (error, format, log, record, search) => {
    /**
     * Defines the function definition that is executed before record is loaded.
     * @param {Object} scriptContext
     * @param {Record} scriptContext.newRecord - New record
     * @param {string} scriptContext.type - Trigger type; use values from the context.UserEventType enum
     * @param {Form} scriptContext.form - Current form
     * @param {ServletRequest} scriptContext.request - HTTP request information sent from the browser for a client action only.
     * @since 2015.2
     */

    const COMPANY_DEST = "Unibell";
    const SYSTEM_DEST = "Traslado de Inventario";
    const METHOD = "2";

    const afterSubmit = (scriptContext) => {
      try {
        const { newRecord, type, UserEventType } = context;

        // Solo ejecuta en creación, edición o copia
        if (![UserEventType.CREATE, UserEventType.EDIT, UserEventType.COPY].includes(type)) return;

        log.audit("afterSubmit", `Procesando Traslado de Inventario ID: ${newRecord.id}`);

        let recordTransfer = record.load({
          type: record.Type.INVENTORYTRANSFER,
          id: newRecord.id,
          isDynamic: true,
        });

        const json = buildProviderJson(recordTransfer);
        log.audit('JSON generado', JSON.stringify(json, null, 2));

        // Obtiene configuración del servicio
        const config = getServiceConfig();

        // Envía JSON al servicio
        const response = sendToService(config, json);

        // Guarda trazabilidad
        saveIntegrationLog({
          destination: COMPANY_DEST,
          entity: SYSTEM_DEST,
          method: METHOD,
          key: recordTransfer.id,
          request: json,
          response: response.body ? JSON.parse(response.body) : {},
          status: response.code
        });

      } catch (error) {
        log.error("Error en afterSubmit", error);
      }
    };



    // FUNCIONES 

    const buildProviderJson = (provider) => {

      const base = {
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

      }

      return base;
    };

    const getServiceConfig = () => {
      try {
        const res = [];
        const searchObj = search.create({
          type: 'customrecord_uni_serv_integ',
          columns: [
            'custrecord_uni_serv_integ_tok_traslado',
            'custrecord_uni_serv_integ_link_traslado'
          ]
        });

        searchObj.run().each(result => {
          res.push({
            token: result.getValue('custrecord_uni_serv_integ_tok_traslado'),
            url: result.getValue('custrecord_uni_serv_integ_link_traslado')
          });
          return true;
        });

        if (res.length !== 1) throw 'Error: configuración del servicio inválida';
        return res[0];

      } catch (error) {
        log.error('getServiceConfig', error);
        throw error;
      }
    };

    const sendToService = (config, json) => {
      const headers = { 'Content-Type': 'application/json' };
      if (config.token) headers['Authorization'] = 'Bearer ' + config.token;

      const protocol = config.url.startsWith('https') ? https : http;

      try {
        const response = protocol.post({
          url: config.url,
          body: JSON.stringify(json),
          headers
        });
        log.audit('Respuesta del servicio', response.body);
        return response;
      } catch (err) {
        log.error('Error al enviar al servicio', err);
        throw err;
      }
    };


    const saveIntegrationLog = (params) => {
      try {
        log.audit('saveIntegrationLog - Inicio', JSON.stringify(params));

        const logRecord = record.create({
          type: 'customrecord_ts_outb_int_log',
          isDynamic: true
        });

        logRecord.setValue('custrecord_ts_outb_int_log_destination', params.destination);
        logRecord.setValue('custrecord_ts_outb_int_log_entity', params.entity);
        logRecord.setValue('custrecord_ts_outb_int_log_method', params.method);
        logRecord.setValue('custrecord_ts_outb_int_log_key', params.key);
        logRecord.setValue('custrecord_ts_outb_int_log_request', JSON.stringify(params.request));
        logRecord.setValue('custrecord_ts_outb_int_log_response', JSON.stringify(params.response));
        logRecord.setValue('custrecord_ts_outb_int_log_status', params.status);

        const logId = logRecord.save();
        log.audit('Trazabilidad registrada', `ID: ${logId}`);

      } catch (e) {
        log.error('Error en saveIntegrationLog', e);
      }
    };

    return { afterSubmit };
  });
