/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/http', 'N/https', 'N/log', 'N/record', 'N/search', 'N/runtime', 'N/url'],
    /**
     * @param {http} http
     * @param {https} https
     * @param {log} log
     * @param {record} record
     * @param {search} search
     * @param {runtime} runtime
     * @param {url} url
     */
    (http, https, log, record, search, runtime, url) => {

        const COMPANY_DEST = 'Unibell';
        const SYSTEM_DEST = 'Proveedor';
        const METHOD = '2';

        const afterSubmit = (context) => {
            try {
                const { newRecord, type, UserEventType } = context;

                // Solo ejecuta en creación, edición o copia
                if (![UserEventType.CREATE, UserEventType.EDIT, UserEventType.COPY].includes(type)) return;

                log.audit('afterSubmit', `Procesando proveedor ID: ${newRecord.id}`);

                const providerRecord = record.load({
                    type: record.Type.VENDOR,
                    id: newRecord.id,
                    isDynamic: true
                });



                const json = buildProviderJson(providerRecord);
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
                    key: providerRecord.id,
                    request: json,
                    response: response.body ? JSON.parse(response.body) : {},
                    status: response.code
                });

            } catch (error) {
                log.error('Error en afterSubmit', error);
            }
        };


        const buildProviderJson = (provider) => {

            const isInactive = provider.getValue('isinactive');
            if (isInactive) {
                log.audit('Proveedor desactivo', `El proveedor ID ${provider.id} está desactivo. No se enviará al servicio.`);
                return null;
            }


            let userObj = runtime.getCurrentUser();
            log.debug('Script ID: ', userObj);

            const host = url.resolveDomain({ hostType: url.HostType.APPLICATION });
            log.debug('Host: ', host);


            const base = {
                id: provider.id,
                isinactive: isInactive,
                recordType: provider.type,
                entityid: provider.getValue('entityid'),
                altname: provider.getValue('altname'),
                companyname: provider.getValue('companyname'),
                isperson: provider.getValue('isperson'),
                category: provider.getValue('category'),
                email: provider.getValue('email'),
                phone: provider.getValue('phone'),
                subsidiary: provider.getValue('subsidiary'),

                custentity_uni_grupo_de_proveedor: provider.getValue('custentity_uni_grupo_de_proveedor'),
                custentity_pe_vendor_name: provider.getValue('custentity_pe_vendor_name'),
                custentity_pe_type_of_person: provider.getValue('custentity_pe_type_of_person'),
                custentity_pe_document_number: provider.getValue('custentity_pe_document_number'),
                vatregnumber: provider.getValue('vatregnumber'),
                custentity_pe_entity_country: provider.getValue('custentity_pe_entity_country'),
                custentity_pe_payment_method: provider.getValue('custentity_pe_payment_method'),
                custentity_pe_detraccion_account: provider.getValue('custentity_pe_detraccion_account'),
                custentity_pe_link_btw_taxpayer_foreign: provider.getValue('custentity_pe_link_btw_taxpayer_foreign'),

                custentity_pe_is_wh_: provider.getValue('custentity_pe_is_wh_'),
                custentity_pe_is_agent_perception: provider.getValue('custentity_pe_is_agent_perception'),
                custentity_pe_sujeto_retencion: provider.getValue('custentity_pe_sujeto_retencion'),
                custentity_pe_is_good_contributor: provider.getValue('custentity_pe_is_good_contributor'),
                custentity_pe_est_contrib: provider.getValue('custentity_pe_est_contrib'),
                custentity_pe_cond_contri_prov: provider.getValue('custentity_pe_cond_contri_prov'),

                legalname: provider.getValue('legalname'),
                payablesaccount: provider.getValue('payablesaccount'),
                currency: provider.getValue('currency'),
                incoterm: provider.getValue('incoterm'),
                custentity_4601_defaultwitaxcode: provider.getValue('custentity_4601_defaultwitaxcode'),
                terms: provider.getValue('terms'),
                workcalendar: provider.getValue('workcalendar'),

                // Dirección principal
                defaultshipping: provider.getValue('defaultshipping'),
                defaultbilling: provider.getValue('defaultbilling'),
                defaultaddress: cleanAddress(provider.getValue('defaultaddress')),
                country: provider.getValue('country'),
                addressee: provider.getValue('addressee'),
                addr1: provider.getValue('addr1'),
                addr2: provider.getValue('addr2'),
                zip: provider.getValue('zip'),
                custrecord_uni_departamento: provider.getValue('custrecord_uni_departamento'),
                custrecord_uni_provincia: provider.getValue('custrecord_uni_provincia'),
                custrecord_uni_distrito: provider.getValue('custrecord_uni_distrito'),
                custrecord_uni_ubigeo: provider.getValue('custrecord_uni_ubigeo'),
                custrecord_uni_latitud: provider.getValue('custrecord_uni_latitud'),
                custrecord_uni_longitud: provider.getValue('custrecord_uni_longitud'),
                user: userObj.name,
                role: userObj.roleId,
                host: host
            }


            const isPerson = provider.getValue('isperson');
            // Si es persona natural
            if (isPerson !== "F") {
                base.firstname = provider.getValue('firstname');
                base.title = provider.getValue('title');
                base.comments = provider.getValue('comments');
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

        return { afterSubmit };

    });
