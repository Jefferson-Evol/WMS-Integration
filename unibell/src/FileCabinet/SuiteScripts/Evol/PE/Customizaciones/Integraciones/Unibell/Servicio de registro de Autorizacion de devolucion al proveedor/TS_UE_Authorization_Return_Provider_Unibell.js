/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/http', 'N/https', 'N/log', 'N/record', 'N/search'],
    /**
     * @param {http} http
     * @param {https} https
     * @param {log} log
     * @param {record} record
     * @param {search} search
     */
    (http, https, log, record, search) => {

        const COMPANY_DEST = 'Unibell';
        const SYSTEM_DEST = 'Autorizacion Devolucion Proveedor';
        const METHOD = '2';

        const afterSubmit = (context) => {
            log.debug('afterSubmit - start', `Evento: ${context.type}`);
            try {
                const { newRecord, type} = context;

                // Solo ejecuta en creación, edición o copia
                 if (!['create', 'edit', 'copy'].includes(type)) {
                    log.audit('Tipo no procesado', type);
                    return;
                }

                log.audit('afterSubmit', `Procesando Autorizacion Devolucion Proveedor ID: ${newRecord.id}`);

                const providerRecord = record.load({
                    type:  record.Type.VENDOR_RETURN_AUTHORIZATION,    // VENDOR_RETURN_AUTHORIZATION,
                    id: newRecord.id,
                    isDynamic: true
                });

                log.audit('Record cargado correctamente', `ID: ${providerRecord.id}`);


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
            
           

            const base = {
                id: provider.id,
                recordType: provider.type,
                location: provider.getValue('location'),
                tranid: provider.getValue('tranid'),
                entity: provider.getValue('entity'),
                trandate: provider.getValue('trandate'),
                currency: provider.getValue('currency'),
                usertotal: provider.getValue('usertotal'),
                exchangerate: provider.getValue('exchangerate'),
                taxtotal: provider.getValue('taxtotal'),
                vatregnum: provider.getValue('vatregnum'),
                createdfrom: provider.getValue('createdfrom'),
                memo: provider.getValue('memo'),
                department: provider.getValue('department'),
                class: provider.getValue('class'),
                items : []
            }


            // Añadiendo los items 
            const itemCount = provider.getLineCount({ sublistId: 'item'})
            log.debug('itemCount', itemCount);

            for (let i = 0; i < itemCount; i++) {

                provider.selectLine({ sublistId: 'item', line: i });

                const item = provider.getCurrentSublistValue({ sublistId: 'item', fieldId: 'item' });
                const item_display = provider.getCurrentSublistValue({ sublistId: 'item', fieldId: 'item_display' });
                const quantity = provider.getCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity' });
                const units = provider.getCurrentSublistValue({ sublistId: 'item', fieldId: 'units' });
                const rate = provider.getCurrentSublistValue({ sublistId: 'item', fieldId: 'rate' });   
                const amount = provider.getCurrentSublistValue({ sublistId: 'item', fieldId: 'amount' });
                const department = provider.getCurrentSublistValue({ sublistId: 'item', fieldId: 'department' });
                const classField = provider.getCurrentSublistValue({ sublistId: 'item', fieldId: 'class' });
                const location = provider.getCurrentSublistValue({ sublistId: 'item', fieldId: 'location' });
                const taxcode = provider.getCurrentSublistValue({ sublistId: 'item', fieldId: 'taxcode' });
                const tax1amt = provider.getCurrentSublistValue({ sublistId: 'item', fieldId: 'tax1amt' });
                const grossamt = provider.getCurrentSublistValue({ sublistId: 'item', fieldId: 'grossamt' });   

                base.items.push({
                    item,
                    item_display,
                    quantity,
                    units,
                    rate,
                    amount,
                    department,
                    class: classField,
                    location,
                    taxcode,
                    tax1amt,
                    grossamt
                });

                provider.commitLine({ sublistId: 'item' });
            }

            return base;
        };



        const getServiceConfig = () => {
            try {
                const res = [];
                const searchObj = search.create({
                    type: 'customrecord_uni_serv_integ',
                    columns: [
                        'custrecord_uni_serv_integ_tok_devol',
                        'custrecord_uni_serv_integ_link_devol'
                    ]
                });

                searchObj.run().each(result => {
                    res.push({
                        token: result.getValue('custrecord_uni_serv_integ_tok_devol'),
                        url: result.getValue('custrecord_uni_serv_integ_link_devol')
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
