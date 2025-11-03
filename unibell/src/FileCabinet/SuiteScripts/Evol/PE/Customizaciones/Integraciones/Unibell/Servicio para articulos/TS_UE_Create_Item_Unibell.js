/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/http', 'N/https', 'N/log', 'N/record', 'N/search'],
    /**
 * @param{http} http
 * @param{https} https
 * @param{log} log
 * @param{record} record
 * @param{search} search
 */
    (http, https, log, record, search) => {

        const companiaDestino = 'Unibell';
        const sistemaDestino = 'Artículos';
        const metodo = 'POST';

        /**
         * Defines the function definition that is executed after record is submitted.
         * @param {Object} scriptContext
         * @param {Record} scriptContext.newRecord - New record
         * @param {string} scriptContext.type - Trigger type; use values from the context.UserEventType enum
         * @since 2015.2
         */

        const afterSubmit = (scriptContext) => {
            try {

                if (scriptContext.type === scriptContext.UserEventType.CREATE || scriptContext.type === scriptContext.UserEventType.EDIT || scriptContext.type === scriptContext.UserEventType.COPY) {

                    let newRecord = scriptContext.newRecord;

                    // de manera estática
                    let json = {
                        "id": "2388",
                        "itemid": "AO-XX-01",
                        "displayname": "AMONIACO BAKER 28%",
                        "custitem_uni_tipo_inventario": "2",
                        "custitem_uni_familia": "32",
                        "custitem_uni_sub_familia": "42",
                        "recordType": "lotnumberedinventoryitem",
                        "stockunit": "19",
                        "custitem_uni_status_item": "1",
                        "taxschedule": "1",
                        "custitem_uni_inci": "AMMONIUM HYDROXIDE",
                        "custitem_uni_unid_caja": "28",
                        "custitem_uni_fiscalizado": "T",
                        "purchasedescription": "AMONIACO BAKER 28%",
                        "custitem_uni_clas_inventario": "1"
                        // agregar el campo de node de jerarquia
                    }

                    log.audit('JSON estático a enviar', JSON.stringify(json, null, 2));

                    /*
 
                    let recordItem = record.load({
                        type: record.Type.LOT_NUMBERED_INVENTORY_ITEM,
                        id: newRecord.id,
                        isDynamic: true
                    })
 
                    // de manera dinámica
                    let jsonDynamic = {
                        "id": recordItem.id,
                        "itemid": recordItem.getValue('itemid'),
                        "displayname": recordItem.getValue('displayname'),
                        "custitem_uni_tipo_inventario": recordItem.getValue('custitem_uni_tipo_inventario'),
                        "custitem_uni_familia": recordItem.getValue('custitem_uni_familia'),
                        "custitem_uni_sub_familia": recordItem.getValue('custitem_uni_sub_familia'),
                        "recordType": recordItem.type,
                        "stockunit": recordItem.getValue('stockunit'),
                        "custitem_uni_status_item": recordItem.getValue('custitem_uni_status_item'),
                        "taxschedule": recordItem.getValue('taxschedule'),
                        "custitem_uni_inci": recordItem.getValue('custitem_uni_inci'),
                        "custitem_uni_unid_caja": recordItem.getValue('custitem_uni_unid_caja'),
                        "custitem_uni_fiscalizado": recordItem.getValue('custitem_uni_fiscalizado'),
                        "purchasedescription": recordItem.getValue('purchasedescription'),
                        "custitem_uni_clas_inventario": recordItem.getValue('custitem_uni_clas_inventario')
                    }
                    */


                    let config = getUrlServiceDetails();

                    const headers = {
                        'Content-Type': 'application/json'
                    };

                    if (config.token) headers['Authorization'] = 'Bearer ' + config.token;

                    const protocol = config.url.startsWith('https') ? https : http;

                    let response;

                    try {
                        const response = protocol.post({
                            url: config.url,
                            body: JSON.stringify(json),
                            headers
                        });
                        log.audit('Respuesta', response.body);
                    } catch (httpError) {
                        log.error('Error al enviar al servicio', httpError);
                    }


                    if (response) {
                        saveRequest({
                            destination: companiaDestino,
                            entity: sistemaDestino,
                            method: metodo,
                            key: scriptContext.newRecord.id,
                            request: json,
                            response: JSON.parse(response.body || '{}'),
                            status: response.code
                        });
                    }

                }

            } catch (error) {
                log.error('Error en afterSubmit', error);
            }

        }


        // FUNCIONES
        const getUrlServiceDetails = () => {
            try {
                let res = [];
                var searchObj = search.create({
                    type: "customrecord_uni_serv_integ",
                    filters:
                        [
                        ],
                    columns:
                        [
                            search.createColumn({ name: "custrecord_uni_serv_integ_tok_articulos", label: "UNI - Token Artículos" }),
                            search.createColumn({ name: "custrecord_uni_serv_integ_link_articulos", label: "UNI - Servicio Artículos" })
                        ]
                });

                let searchResultCount = searchObj.runPaged().count;
                log.debug("searchObj  result count", searchResultCount);


                searchObj.run().each(result => {
                    res.push({
                        token: result.getValue('custrecord_uni_serv_integ_tok_articulos'),
                        url: result.getValue('custrecord_uni_serv_integ_link_articulos')
                    });
                    return true;
                });

                if (res.length !== 1) throw 'Error en configuración del servicio';

                return res[0];

            } catch (error) {
                log.error('getUrlServiceDetails', error);
                throw error;
            }
        }

        const saveRequest = (params) => {
            try {
                log.audit('saveRequest - Inicio', JSON.stringify(params));

                const req = record.create({
                    type: 'customrecord_ts_outb_int_log',
                    isDynamic: true
                });
                log.audit('Paso 1', 'Registro creado');

                try {
                    req.setValue({ fieldId: 'custrecord_ts_outb_int_log_destination', value: params.destination });
                    req.setValue({ fieldId: 'custrecord_ts_outb_int_log_entity', value: params.entity });
                    req.setValue({ fieldId: 'custrecord_ts_outb_int_log_method', value: params.method });
                    req.setValue({ fieldId: 'custrecord_ts_outb_int_log_key', value: params.key });
                    req.setValue({ fieldId: 'custrecord_ts_outb_int_log_request', value: JSON.stringify(params.request) });
                    req.setValue({ fieldId: 'custrecord_ts_outb_int_log_response', value: JSON.stringify(params.response) });
                    req.setValue({ fieldId: 'custrecord_ts_outb_int_log_status', value: params.status });
                    log.audit('Paso 2', 'Campos seteados correctamente');
                } catch (setErr) {
                    log.error('Error al asignar campos', setErr);
                }

                try {
                    const idLog = req.save();
                    log.audit('Paso 3', 'Registro guardado con ID: ' + idLog);
                } catch (saveErr) {
                    log.error('Error al guardar registro', saveErr);
                }

            } catch (e) {
                log.error('Error general en saveRequest', e);
            }
        };


        return { afterSubmit }

    });