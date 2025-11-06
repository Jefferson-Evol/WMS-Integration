

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
        const SYSTEM_DEST = 'Artículos';
        const METHOD = '2';


        const afterSubmit = (context) => {
            try {
                const { newRecord, type, UserEventType } = context;

                if (![UserEventType.CREATE, UserEventType.EDIT, UserEventType.COPY].includes(type)) return;

                log.audit('afterSubmit', `Procesando item ID: ${newRecord.id}, tipo: ${newRecord.type}`);

                // Buscar el tipo de item (Artículo inventariable, Artículo inventariable loteado y Artículo de ensamblaje loteado )
                const recordType = resolveItemType(newRecord.type);

                const itemRecord = record.load({
                    type: recordType,
                    id: newRecord.id,
                    isDynamic: true
                });


                const json = buildDynamicJson(itemRecord);

                log.audit('Json generado', JSON.stringify(json, null, 2));

                // Obtiene la configuración del servicio (URL y token)
                const config = getServiceConfig();

                // Respuesta al servicio externo
                const response = sendToService(config, json);

                // Guarda el log de la integración (trazabilidad)
                saveIntegrationLog({
                    destination: COMPANY_DEST,
                    entity: SYSTEM_DEST,
                    method: METHOD,
                    key: itemRecord.id,
                    request: json,
                    response: response.body ? JSON.parse(response.body) : {},
                    status: response.code
                });

            } catch (e) {
                log.error('Error en afterSubmit', e);
            }
        };

     
        const resolveItemType = (typeName) => {
            const map = {
                'lotnumberedinventoryitem': record.Type.LOT_NUMBERED_INVENTORY_ITEM,
                'lotnumberedassemblyitem': record.Type.LOT_NUMBERED_ASSEMBLY_ITEM,
                'inventoryitem': record.Type.INVENTORY_ITEM
            };

            const resolved = map[typeName.toLowerCase()];
            if (!resolved) throw `Tipo de ítem no soportado: ${typeName}`;
            return resolved;
        };


        //  CONSTRUCCIÓN DEL JSON
        const buildDynamicJson = (item) => {
            const isInactive = item.getValue('isinactive');
            if (isInactive) {
                log.audit('Item desactivo', `El ítem ID ${item.id} está desactivo. No se enviará al servicio.`);
                return null;
            }
            
            let lineas = item.getLineCount({ sublistId: 'hierarchyversions' }); 
            let hierarchyNode;
            log.debug('Número de líneas en sublista "hierarchyversions": ', lineas);


            for (let i = 0; i < lineas; i++) {
                hierarchyNode = item.getSublistValue({
                    sublistId: 'hierarchyversions',
                    fieldId: 'hierarchynode',
                    line: i
                });
                log.debug('Línea ' + i, 'hierarchynode: ' + hierarchyNode);
            }


            let userObj = runtime.getCurrentUser();
            log.debug('Script ID Usuario: ', userObj);

            const host = url.resolveDomain({ hostType: url.HostType.APPLICATION });
            log.debug('Host: ', host);


            const base = {
                id: item.id,
                recordType: item.type,
                isinactive: isInactive,
                itemid: item.getValue('itemid'),
                displayname: item.getValue('displayname'),
                upccode: item.getValue('upccode'),
                unitstype: item.getValue('unitstype'),
                stockunit: item.getValue('stockunit'),
                purchaseunit: item.getValue('purchaseunit'),
                saleunit: item.getValue('saleunit'),
                consumptionunit: item.getValue('consumptionunit'),
                baseunit: item.getValue('baseunit'),
                parent: item.getValue('parent'),
                vendorname: item.getValue('vendorname'),
                subsidiary: item.getValue('subsidiary'),
                department: item.getValue('department'),
                class: item.getValue('class'),
                location: item.getValue('location'),
                cseg5: item.getValue('cseg5'),
                custitem_uni_familia: item.getValue('custitem_uni_familia'),
                custitem_uni_sub_familia: item.getValue('custitem_uni_sub_familia'),
                custitem_uni_sub_nivel_familia: item.getValue('custitem_uni_sub_nivel_familia'),
                custitem_uni_tipo_inventario: item.getValue('custitem_uni_tipo_inventario'),
                custitem_uni_peso: item.getValue('custitem_uni_peso'),
                custitem_uni_inci: item.getValue('custitem_uni_inci'),
                custitem_uni_nso: item.getValue('custitem_uni_nso'),
                custitem_uni_desc_nso: item.getValue('custitem_uni_desc_nso'),
                custitem_uni_expired_nso: item.getValue('custitem_uni_expired_nso'),
                custitem_uni_part_arancelaria: item.getValue('custitem_uni_part_arancelaria'),
                custitem_uni_tvu: item.getValue('custitem_uni_tvu'),
                custitem_uni_cod_anterior: item.getValue('custitem_uni_cod_anterior'),
                custitem_uni_dun14: item.getValue('custitem_uni_dun14'),
                custitem_uni_largo: item.getValue('custitem_uni_largo'),
                custitem_uni_ancho: item.getValue('custitem_uni_ancho'),
                custitem_uni_alto: item.getValue('custitem_uni_alto'),
                custitem_uni_pao: item.getValue('custitem_uni_pao'),
                custitem_uni_cod_std_nnuu: item.getValue('custitem_uni_cod_std_nnuu'),
                custitem_uni_segmento_nnuu: item.getValue('custitem_uni_segmento_nnuu'),
                custitem_uni_familia_nnuu: item.getValue('custitem_uni_familia_nnuu'),
                custitem_uni_clase_nnuu: item.getValue('custitem_uni_clase_nnuu'),
                custitem_uni_presentacion: item.getValue('custitem_uni_presentacion'),
                custitem_uni_unid_caja: item.getValue('custitem_uni_unid_caja'),
                custitem_uni_clas_inventario: item.getValue('custitem_uni_clas_inventario'),
                custitem_uni_fiscalizado: item.getValue('custitem_uni_fiscalizado'),
                custitem_uni_imo: item.getValue('custitem_uni_imo'),
                custitem_uni_hv: item.getValue('custitem_uni_hv'),
                custitem_uni_status_item: item.getValue('custitem_uni_status_item'),
                custitem_uni_ancho_caja_master: item.getValue('custitem_uni_ancho_caja_master'),
                custitem_uni_largo_caja_master: item.getValue('custitem_uni_largo_caja_master'),
                custitem_uni_alto_caja_master: item.getValue('custitem_uni_alto_caja_master'),
                tracklandedcost: item.getValue('tracklandedcost'),
                purchasedescription: item.getValue('purchasedescription'),
                costingmethoddisplay: item.getValue('costingmethoddisplay'),
                usebins: item.getValue('usebins'),
                autopreferredstocklevel: item.getValue('autopreferredstocklevel'),
                autoreorderpoint: item.getValue('autoreorderpoint'),
                autoleadtime: item.getValue('autoleadtime'),
                safetystockleveldays: item.getValue('safetystockleveldays'),
                futurehorizon: item.getValue('futurehorizon'),
                manufacturer: item.getValue('manufacturer'),
                mpn: item.getValue('mpn'),
                costcategory: item.getValue('costcategory'),
                supplyreplenishmentmethod: item.getValue('supplyreplenishmentmethod'),
                planningitemcategory: item.getValue('planningitemcategory'),
                salesdescription: item.getValue('salesdescription'),
                costestimatetype: item.getValue('costestimatetype'),
                cogsaccount: item.getValue('cogsaccount'),
                assetaccount: item.getValue('assetaccount'),
                incomeaccount: item.getValue('incomeaccount'),
                taxschedule: item.getValue('taxschedule'),
                custitem_pe_existence_type: item.getValue('custitem_pe_existence_type'),
               custitem_pe_cod_existence_type: item.getValue('custitem_pe_cod_existence_type'),
               custitem_pe_inventory_catalog: item.getValue('custitem_pe_inventory_catalog'),
                custitem_pe_cod_inventory_catalog: item.getValue('custitem_pe_cod_inventory_catalog'),
                custitem_pe_measurement_unit: item.getValue('custitem_pe_measurement_unit'),
                custitem_pe_cod_measure_unit: item.getValue('custitem_pe_cod_measure_unit'),
                custitem_pe_valuation_method: item.getValue('custitem_pe_valuation_method'),
               custitem_pe_cod_valuation_method: item.getValue('custitem_pe_cod_valuation_method'),
                custitem_pe_purchase_account: item.getValue('custitem_pe_purchase_account'),
                custitem_pe_variation_account: item.getValue('custitem_pe_variation_account'),
                hierarchynode: hierarchyNode,
                user: userObj.name,
                role: userObj.roleId,
                host: host
            };


            // Campos específicos para el tipo ensamblaje
            if (item.type === record.Type.LOT_NUMBERED_ASSEMBLY_ITEM) {
                base.wipvarianceacct = item.getValue('wipvarianceacct');
                base.scrapacct = item.getValue('scrapacct');
                base.wipacct = item.getValue('wipacct');
                base.unbuildvarianceaccount = item.getValue('unbuildvarianceaccount');
            }

            return base;
        };


        const getServiceConfig = () => {
            try {
                const res = [];
                const searchObj = search.create({
                    type: 'customrecord_uni_serv_integ',
                    columns: [
                        'custrecord_uni_serv_integ_tok_articulos',
                        'custrecord_uni_serv_integ_link_articulos'
                    ]
                });

                searchObj.run().each(result => {
                    res.push({
                        token: result.getValue('custrecord_uni_serv_integ_tok_articulos'),
                        url: result.getValue('custrecord_uni_serv_integ_link_articulos')
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

                log.audit('saveRequest - Inicio', JSON.stringify(params));

                const logRecord = record.create({
                    type: 'customrecord_ts_outb_int_log',
                    isDynamic: true
                });

                log.audit('Registro creado');


                try {
                    logRecord.setValue('custrecord_ts_outb_int_log_destination', params.destination);
                    logRecord.setValue('custrecord_ts_outb_int_log_entity', params.entity);
                    logRecord.setValue('custrecord_ts_outb_int_log_method', params.method);
                    logRecord.setValue('custrecord_ts_outb_int_log_key', params.key);
                    logRecord.setValue('custrecord_ts_outb_int_log_request', JSON.stringify(params.request));
                    logRecord.setValue('custrecord_ts_outb_int_log_response', JSON.stringify(params.response));
                    logRecord.setValue('custrecord_ts_outb_int_log_status', params.status);
                    log.audit('Campos seteados correctamente');
                } catch (error) {
                    log.error('Error al asignar campos', error);
                }

                try {
                    const logId = logRecord.save();
                    log.audit('Registro guardado con ID', logId);

                } catch (error) {
                    log.error('Error al guardar registro', error);
                }
            } catch (e) {
                log.error('Error al registrar integración', e);
            }
        };


        return { afterSubmit }

});

