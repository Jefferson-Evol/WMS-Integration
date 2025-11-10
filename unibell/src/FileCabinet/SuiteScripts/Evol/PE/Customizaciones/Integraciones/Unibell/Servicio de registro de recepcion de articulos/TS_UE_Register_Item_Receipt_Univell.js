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

                log.audit('afterSubmit', `Procesando proveedor ID: ${newRecord.id}`);

                const itemRecord = record.load({
                    type: record.Type.ITEM_RECEIPT,
                    id: newRecord.id,
                    isDynamic: true
                });



                const json = buildProviderJson(itemRecord);
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

        const buildProviderJson = (itemRecord) => {

            const isInactive = itemRecord.getValue('isinactive');
            if (isInactive) {
                log.audit('Proveedor desactivo', `El proveedor ID ${itemRecord.id} está desactivo. No se enviará al servicio.`);
                return null;
            }


            let userObj = runtime.getCurrentUser();
            log.debug('Script ID: ', userObj);

            const host = url.resolveDomain({ hostType: url.HostType.APPLICATION });
            log.debug('Host: ', host);


            const base = {
                id: itemRecord.id,
                isinactive: isInactive,
                recordType: itemRecord.type,
                entityid: itemRecord.getValue('entityid'),
                altname: itemRecord.getValue('altname'),
                companyname: itemRecord.getValue('companyname'),
                isperson: itemRecord.getValue('isperson'),
                comments: itemRecord.getValue('comments'),
                url: itemRecord.getValue('url'),
                category: itemRecord.getValue('category'),
                email: itemRecord.getValue('email'),
                phone: itemRecord.getValue('phone'),
                subsidiary: itemRecord.getValue('subsidiary'),

                custentity_uni_grupo_de_proveedor: itemRecord.getValue('custentity_uni_grupo_de_proveedor'),
                custentity_pe_vendor_name: itemRecord.getValue('custentity_pe_vendor_name'),
                custentity_pe_type_of_person: itemRecord.getValue('custentity_pe_type_of_person'),
                custentity_pe_document_number: itemRecord.getValue('custentity_pe_document_number'),
                vatregnumber: itemRecord.getValue('vatregnumber'),
                custentity_pe_entity_country: itemRecord.getValue('custentity_pe_entity_country'),
                custentity_pe_payment_method: itemRecord.getValue('custentity_pe_payment_method'),
                custentity_pe_detraccion_account: itemRecord.getValue('custentity_pe_detraccion_account'),
                custentity_pe_link_btw_taxpayer_foreign: itemRecord.getValue('custentity_pe_link_btw_taxpayer_foreign'),

                custentity_pe_is_wh_: itemRecord.getValue('custentity_pe_is_wh_'),
                custentity_pe_is_agent_perception: itemRecord.getValue('custentity_pe_is_agent_perception'),
                custentity_pe_sujeto_retencion: itemRecord.getValue('custentity_pe_sujeto_retencion'),
                custentity_pe_is_good_contributor: itemRecord.getValue('custentity_pe_is_good_contributor'),
                custentity_pe_est_contrib: itemRecord.getValue('custentity_pe_est_contrib'),
                custentity_pe_cond_contri_prov: itemRecord.getValue('custentity_pe_cond_contri_prov'),

                legalname: itemRecord.getValue('legalname'),
                payablesaccount: itemRecord.getValue('payablesaccount'),
                currency: itemRecord.getValue('currency'),
                incoterm: itemRecord.getValue('incoterm'),
                custentity_4601_defaultwitaxcode: itemRecord.getValue('custentity_4601_defaultwitaxcode'),



            
                
                user: userObj.name,
                role: userObj.roleId,
                host: host
            }


            const isPerson = provider.getValue('isperson');
            // Si es persona natural
            if (isPerson !== "F") {
                base.firstname = provider.getValue('firstname');
                base.title = provider.getValue('title');
                base.custentity_pe_ap_paterno = provider.getValue('custentity_pe_ap_paterno');
                base.custentity_pe_ap_materno = provider.getValue('custentity_pe_ap_materno');
            }

            return base;
        };


        const cleanAddress = (address) => {
            if (!address) return '';
            return address.replace(/[\r\n]+/g, ' ').trim();
        };

        const getServiceConfig = () => {
            try {
                const res = [];
                const searchObj = search.create({
                    type: 'customrecord_uni_serv_integ',
                    columns: [
                        'custrecord_uni_serv_integ_tok_proveedor',
                        'custrecord_uni_serv_integ_link_proveedor'
                    ]
                });

                searchObj.run().each(result => {
                    res.push({
                        token: result.getValue('custrecord_uni_serv_integ_tok_proveedor'),
                        url: result.getValue('custrecord_uni_serv_integ_link_proveedor')
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
