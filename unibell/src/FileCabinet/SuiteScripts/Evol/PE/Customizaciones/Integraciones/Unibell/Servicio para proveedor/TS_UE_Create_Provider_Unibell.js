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
        const sistemaDestino = 'Proveedor';
        const metodo = 'POST';

        /**
         * Defines the function definition that is executed after record is submitted.
         * @param {Object} scriptContext
         * @param {Record} scriptContext.newRecord - New record
         * @param {Record} scriptContext.oldRecord - Old record
         * @param {string} scriptContext.type - Trigger type; use values from the context.UserEventType enum
         * @since 2015.2
         */
        const afterSubmit = (scriptContext) => {

            try {

                if (scriptContext.type === scriptContext.UserEventType.CREATE || scriptContext.type === scriptContext.UserEventType.EDIT || scriptContext.type === scriptContext.UserEventType.COPY) {

                    let newRecord = scriptContext.newRecord;

                    // de manera estática
                    /*
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
                    }
                    log.audit('JSON estático a enviar', JSON.stringify(json, null, 2));
                    */

                    let recordProvider = record.load({
                        type: record.Type.VENDOR,
                        id: newRecord.id,
                        isDynamic: true
                    })

                    // de manera dinámica 
                    let jsonDynamic = {
                        "id": recordProvider.id,
                        "recordType": recordProvider.type,
                        "entityid": recordProvider.getValue('entityid'),
                        "altname": recordProvider.getValue('altname'),
                        "companyname": recordProvider.getValue('companyname'),
                        "isperson": recordProvider.getValue('isperson'),
                        "category": recordProvider.getValue('category'),
                        "email": recordProvider.getValue('email'),
                        "phone": recordProvider.getValue('phone'),
                        "subsidiary": recordProvider.getValue('subsidiary'),
                        "custentity_uni_grupo_de_proveedor": recordProvider.getValue('custentity_uni_grupo_de_proveedor'),
                        "custentity_pe_vendor_name": recordProvider.getValue('custentity_pe_vendor_name'),
                        "custentity_pe_type_of_person": recordProvider.getValue('custentity_pe_type_of_person'),
                        "custentity_pe_document_number": recordProvider.getValue('custentity_pe_document_number'),
                        "vatregnumber ": recordProvider.getValue('vatregnumber'),
                        "custentity_pe_entity_country": recordProvider.getValue('custentity_pe_entity_country'),
                        "custentity_pe_payment_method ": recordProvider.getValue('custentity_pe_payment_method '),
                        "custentity_pe_detraccion_account": recordProvider.getValue('custentity_pe_detraccion_account'),
                        "custentity_pe_link_btw_taxpayer_foreign ": recordProvider.getValue('custentity_pe_link_btw_taxpayer_foreign'),
                        "custentity_pe_is_wh_": recordProvider.getValue('custentity_pe_is_wh_'),  // casilla
                        "custentity_pe_is_agent_perception": recordProvider.getValue('custentity_pe_is_agent_perception'),  // casilla
                        "custentity_pe_is_agent_perception": recordProvider.getValue('custentity_pe_is_agent_perception'), // casilla
                        "custentity_pe_sujeto_retencion": recordProvider.getValue('custentity_pe_sujeto_retencion'), // casilla
                        "custentity_pe_is_good_contributor": recordProvider.getValue('custentity_pe_is_good_contributor'), // casilla
                        "custentity_pe_est_contrib": recordProvider.getValue('custentity_pe_est_contrib'),
                        "custentity_pe_cond_contri_prov": recordProvider.getValue('custentity_pe_cond_contri_prov'),
                        "legalname": recordProvider.getValue('legalname'),
                        "payablesaccount": recordProvider.getValue('payablesaccount'),
                        "currency": recordProvider.getValue('currency'),
                        "incoterm": recordProvider.getValue('incoterm'),
                        "custentity_4601_defaultwitaxcode": recordProvider.getValue('custentity_4601_defaultwitaxcode'),
                        "terms": recordProvider.getValue('terms'),
                        "workcalendar": recordProvider.getValue('workcalendar'),
                        "defaultshipping": recordProvider.getValue('defaultshipping'),
                        "defaultbilling": recordProvider.getValue('defaultbilling'),
                        "defaultaddress": recordProvider.getValue('defaultaddress'),
                        "country": recordProvider.getValue('defaultshipping'),
                        "addressee": recordProvider.getValue('addressee'),
                        "addr1": recordProvider.getValue('addr1'),
                        "addr2": recordProvider.getValue('addr2'),
                        "zip": recordProvider.getValue('zip'),
                        "custrecord_uni_departamento": recordProvider.getValue('custrecord_uni_departamento'),
                        "custrecord_uni_provincia": recordProvider.getValue('custrecord_uni_provincia'),
                        "custrecord_uni_distrito": recordProvider.getValue('custrecord_uni_distrito'),
                        "custrecord_uni_ubigeo": recordProvider.getValue('custrecord_uni_ubigeo'),
                        "custrecord_uni_latitud": recordProvider.getValue('custrecord_uni_latitud'),
                        "custrecord_uni_longitud": recordProvider.getValue('custrecord_uni_longitud'),


                        //campos para persona individual isPerson = true
                        "firstname": recordProvider.getValue('firstname'),
                        "title": recordProvider.getValue('title'),
                        "comments": recordProvider.getValue('comments'),
                        "category": recordProvider.getValue('category'),
                        "custentity_pe_ap_paterno": recordProvider.getValue('custentity_pe_ap_paterno'),
                        "custentity_pe_ap_materno": recordProvider.getValue('custentity_pe_ap_materno')
                    }


                    log.audit('JSON a enviar', JSON.stringify(jsonDynamic));


                    let config = getUrlServiceDetails();

                    const headers = {
                        'Content-Type': 'application/json'
                    };

                    if (config.token) headers['Authorization'] = 'Bearer ' + config.token;

                    const protocol = config.url.startsWith('https') ? https : http;

                    let response;

                    try {
                        response = protocol.post({
                            url: config.url,
                            body: JSON.stringify(jsonDynamic),
                            headers
                        });
                        log.audit('Respuesta', response.body);
                    } catch (httpError) {
                        log.error('Error al enviar al servicio', httpError);
                    }

                    log.audit('Antes de saveRequest', response ? 'Con respuesta' : 'Sin respuesta');

                    if (response) {
                        saveRequest({
                            destination: companiaDestino,
                            entity: sistemaDestino,
                            method: metodo,
                            key: newRecord.id,
                            request: jsonDynamic,
                            response: response ? JSON.parse(response.body || '{}') : { status: 0, message: 'sin respuesta' },
                            status: response ? response.code : 'ERR'
                        });
                    } else {
                        log.error('No se generó respuesta del servicio, no se guardará trazabilidad.');
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
                            search.createColumn({ name: "name", label: "Nombre" }),
                            search.createColumn({ name: "scriptid", label: "ID de script" }),
                            search.createColumn({ name: "custrecord_uni_serv_integ_link_proveedor", label: "UNI - Servicio Proveedores" }),
                            search.createColumn({ name: "custrecord_uni_serv_integ_tok_proveedor", label: "UNI - Token Proveedores" })
                        ]
                });

                let searchResultCount = searchObj.runPaged().count;
                log.debug("searchObj  result count", searchResultCount);


                searchObj.run().each(result => {
                    res.push({
                        token: result.getValue('custrecord_uni_serv_integ_tok_proveedor'),
                        url: result.getValue('custrecord_uni_serv_integ_link_proveedor')
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
