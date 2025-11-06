/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(["N/error", "N/format", "N/log", "N/record", "N/search", "N/https", "N/http", 'N/runtime'], /**
 * @param{error} error
 * @param{format} format
 * @param{log} log
 * @param{record} record
 * @param{search} search
 * @param{runtime} runtime
 */ (error, format, log, record, search, https, http, runtime) => {
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

    const afterSubmit = (context) => {
      try {
        const { newRecord, type, UserEventType } = context;

        // Solo ejecuta en creación, edición o copia
        if (![UserEventType.CREATE, UserEventType.EDIT, UserEventType.COPY].includes(type)) return;

        log.audit("afterSubmit", `Procesando Traslado de Inventario ID: ${newRecord.id}`);

        let recordTransfer = record.load({
          type: record.Type.INVENTORY_TRANSFER,
          id: newRecord.id,
          isDynamic: true,
        });

        let items = getItems(recordTransfer);


        const json = buildProviderJson(recordTransfer, items);

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

const getItems = (recordTransfer) => {

      let lineItems = recordTransfer.getLineCount({ sublistId: 'inventory' });

      log.audit('lineItems', lineItems);


      let items = [];

      for(let i = 0; i<lineItems; i++) {
        recordTransfer.selectLine({ sublistId: 'inventory', line: i });

        const itemId = recordTransfer.getCurrentSublistValue({
          sublistId: 'inventory',
          fieldId: 'item'
        });

        const description = recordTransfer.getCurrentSublistValue({
          sublistId: 'inventory',
          fieldId: 'description'
        });

        const units = recordTransfer.getCurrentSublistValue({
          sublistId: 'inventory',
          fieldId: 'units'
        });

        const quantityOnHand = recordTransfer.getCurrentSublistValue({
          sublistId: 'inventory',
          fieldId: 'quantityonhand'
        });

        const inventoryDetail = recordTransfer.getCurrentSublistSubrecord({
          sublistId: 'inventory',
          fieldId: 'inventorydetail'
        });

        const lineDetails = [];

        if (inventoryDetail) {
          const lineCount = inventoryDetail.getLineCount({ sublistId: 'inventoryassignment' });

          for (let j = 0; j < lineCount; j++) {
            inventoryDetail.selectLine({ sublistId: 'inventoryassignment', line: j });

            const detail = {
              issueinventorynumber: inventoryDetail.getCurrentSublistValue({
                sublistId: 'inventoryassignment',
                fieldId: 'issueinventorynumber'
              }),
              inventorystatus: inventoryDetail.getCurrentSublistValue({
                sublistId: 'inventoryassignment',
                fieldId: 'inventorystatus'
              }),
              toinventorystatus: inventoryDetail.getCurrentSublistValue({
                sublistId: 'inventoryassignment',
                fieldId: 'toinventorystatus'
              }),
              expirationdate: inventoryDetail.getCurrentSublistValue({
                sublistId: 'inventoryassignment',
                fieldId: 'expirationdate'
              }),
              quantity: inventoryDetail.getCurrentSublistValue({
                sublistId: 'inventoryassignment',
                fieldId: 'quantity'
              })
            };

            lineDetails.push(detail);

            inventoryDetail.commitLine({ sublistId: 'inventoryassignment' });
          }
        }

        items.push({
          item: itemId,
          description,
          units,
          quantityonhand: quantityOnHand,
          details: lineDetails
        });

        recordTransfer.commitLine({ sublistId: 'inventory' });
      }
          log.audit('Detalle completo de ítems', JSON.stringify(items, null, 2));

      return items;
};


  


const buildProviderJson = (recordTransfer, items) => {

  let userObj = runtime.getCurrentUser();
  log.debug('Script ID Usuario: ', userObj);

  const base = {
    id: recordTransfer.id,
    recordType: recordTransfer.type,
    tranid: recordTransfer.getValue("tranid"),
    trandate: recordTransfer.getValue("trandate"),
    memo: recordTransfer.getValue("memo"),
    location: recordTransfer.getValue("location"),
    transferlocation: recordTransfer.getValue("transferlocation"),
    subsidiary: recordTransfer.getValue("subsidiary"),
    department: recordTransfer.getValue("department"),
    class: recordTransfer.getValue("class"),
    cseg5: recordTransfer.getValue("cseg5"),
    custbody_uni_motivo_traslado: recordTransfer.getValue("custbody_uni_motivo_traslado"),
    items: items,
    user: userObj.name,
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
