/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/http', 'N/https', 'N/log', 'N/record', 'N/runtime', 'N/search'],
    /**
 * @param{http} http
 * @param{https} https
 * @param{log} log
 * @param{record} record
 * @param{runtime} runtime
 * @param{search} search
 */
    (http, https, log, record, runtime, search) => {

        const COMPANY_DEST = 'Unibell';
        const SYSTEM_DEST = 'Artículo recepcionado';
        const METHOD = '2';


        const afterSubmit = (context) => {
            try {
                const { newRecord, type, UserEventType } = context;

                // Solo ejecuta en creación, edición o copia
                if (![UserEventType.CREATE, UserEventType.EDIT, UserEventType.COPY].includes(type)) return;

                log.audit('afterSubmit', `Procesando recepción de artículo ID: ${newRecord.id}`);

                const itemRecord = record.load({
                    type: record.Type.ITEM_RECEIPT,
                    id: newRecord.id,
                    isDynamic: true
                });

                let items = getItems(itemRecord);


                const json = buildProviderJson(itemRecord, items);
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
                    key: itemRecord.id,
                    request: json,
                    response: response.body ? JSON.parse(response.body) : {},
                    status: response.code
                });

            } catch (error) {
                log.error('Error en afterSubmit', error);
            }



        }

        //FUNCIONES

        const getItems = (itemRecord) => {

            let lineItems = itemRecord.getLineCount({ sublistId: 'item' });

            log.audit('lineItems', lineItems);

            let items = [];

            for (let i = 0; i < lineItems; i++) {
                itemRecord.selectLine({ sublistId: 'item', line: i });

                const binitem = itemRecord.getCurrentSublistValue({ sublistId: 'item', fieldId: 'binitem' });
                const item = itemRecord.getCurrentSublistValue({ sublistId: 'item', fieldId: 'item' });
                const quantity = itemRecord.getCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity' });
                const inventoryDetail = itemRecord.getCurrentSublistValue({ sublistId: 'item', fieldId: 'inventorydetail' });

                let lineDetails = [];

                if (inventoryDetail) {

                    let lineCount = inventoryDetail.getLineCount({ sublistId: 'inventoryassignment' });

                    for (let j = 0; j < lineCount; j++) {
                        inventoryDetail.selectLine({ sublistId: 'inventoryassignment', line: j });

                        const detail = {
                            inventorynumber: inventoryDetail.getCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'inventorynumber' }),
                            status: inventoryDetail.getCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'status' }),
                            binnumber: inventoryDetail.getCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber' }),
                            expirationdate: inventoryDetail.getCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'expirationdate' }),
                            quantity: inventoryDetail.getCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity' }),
                            custitemnumber_uni_cant_bulto: inventoryDetail.getCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'custitemnumber_uni_cant_bulto' }),
                            custitemnumber_uni_frac_bulto: inventoryDetail.getCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'custitemnumber_uni_frac_bulto' }),
                            custitemnumber_uni_nro_bulto: inventoryDetail.getCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'custitemnumber_uni_nro_bulto' })

                        }

                        lineDetails.push(detail);

                        inventoryDetail.commitLine({ sublistId: 'inventoryassignment' });

                    }
                }


                items.push({
                    binitem,
                    item,
                    quantity,
                    detail: lineDetails
                })

            }

            itemRecord.commitLine({ sublistId: 'item' });

            return items;
        }




        const buildProviderJson = (itemRecord, items) => {

            const base = {
                id: itemRecord.id,
                recordType: itemRecord.type,
                tranid: itemRecord.getValue('tranid'),
                entity: itemRecord.getValue('entity'),
                createdfrom: itemRecord.getValue('createdfrom'),
                trandate: itemRecord.getValue('trandate'),
                memo: itemRecord.getValue('memo'),
                currency: itemRecord.getValue('currency'),
                subsidiary: itemRecord.getValue('subsidiary'),
                custbody_pe_document_type: itemRecord.getValue('email'),
                custbody_pe_serie_cxp: itemRecord.getValue('custbody_pe_serie_cxp'),
                custbody_pe_number: itemRecord.getValue('custbody_pe_number'),
                custbody_uni_origen_de_compra: itemRecord.getValue('custbody_uni_origen_de_compra'),
                custbody_uni_nro_expediente: itemRecord.getValue('custbody_uni_nro_expediente'),
                custbody_uni_nro_de_embarque: itemRecord.getValue('custbody_uni_nro_de_embarque'),
                custbody_uni_tipo_de_expediente: itemRecord.getValue('custbody_uni_tipo_de_expediente'),
                items: items
            }




            return base;
        };



        const getServiceConfig = () => {
            try {
                const res = [];
                const searchObj = search.create({
                    type: 'customrecord_uni_serv_integ',
                    columns: [
                        'custrecord_uni_serv_integ_tok_recep_art',
                        'custrecord_uni_serv_integ_link_recep_art'
                    ]
                });

                searchObj.run().each(result => {
                    res.push({
                        token: result.getValue('custrecord_uni_serv_integ_tok_recep_art'),
                        url: result.getValue('custrecord_uni_serv_integ_link_recep_art')
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



        return { afterSubmit }

    });
