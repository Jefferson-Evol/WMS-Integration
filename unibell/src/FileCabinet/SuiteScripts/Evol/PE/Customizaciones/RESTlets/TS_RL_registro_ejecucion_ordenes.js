/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 */
define(['N/record', 'N/log', 'N/search', 'N/error', 'N/format', 'N/file'], function (record, log, search, error, format, file) {

    // Esquema de validación para Item Fulfillment
    const schema = {
        mainRequest: {
            itemFulfillment: { required: true, type: 'object', itemSchema: 'itemFulfillment' }
        },

        itemFulfillment: {
            orderId: { required: true, type: 'string' },
            orderType: { required: true, type: 'string' },
            tranid: { required: false, type: 'string' },
            trandate: { required: false, type: 'string', pattern: /^\d{2}\/\d{2}\/\d{4}$/ },
            memo: { required: false, type: 'string' },
            shipaddress: { required: false, type: 'string' },
            shipstatus: { required: true, type: 'string', enum: ['C'] },
            localizations: { required: true, type: 'object', itemSchema: 'localizations' },
            items: { required: true, type: 'array', minItems: 1, itemSchema: 'item' }
        },

        localizations: {
            documentType: { required: true, type: 'string', minLength: 1 },
            serieLocation: { required: true, type: 'string', minLength: 1 },
            serie: { required: true, type: 'string', minLength: 1 },
            deliveryInformation: { required: false, type: 'string' },
            driver: { required: false, type: 'string' },
            sourceLocation: { required: false, type: 'string' },
            transportMode: { required: true, type: 'string' },
            transportReason: { required: false, type: 'string' },
            transportReasonDetail: { required: false, type: 'string' },
            sourceUbigeoCode: { required: true, type: 'string' },
            destinationUbigeoCode: { required: false, type: 'string' }
        },

        item: {
            itemId: { required: true, type: 'string' },
            quantity: { required: true, type: 'number', min: 1 },
            location: { required: false, type: 'string' },
            inventoryDetail: { required: true, type: 'array', minItems: 1, itemSchema: 'inventoryDetail' }
        },

        inventoryDetail: {
            serialLotNumber: { required: false, type: 'string' },
            binNumber: { required: true, type: 'string' },
            status: { required: false, type: 'string' },
            m3individual: { required: false, type: 'string', min: 0 },
            quantity: { required: true, type: 'number', min: 1 }
        }
    };

    const RECORD_TYPE = {
        CUSTOMER: 'customer',
        DOMAIN_VALUES: 'customrecord_ts_dom_val_reg_eje_ord',
        LOCATION: 'location'
    }

    const ORDER_TYPE = {
        OTR: 'OTR',
        OV: 'OV',
        ODV: 'ODV'
    }

    const FIELD_MAPPINGS_HEADER = {
        numReferencia: 'tranid',
        fecha: 'trandate',
        nota: 'memo',
        direccionEnvioId: 'shippingaddress',
        estado: 'shipstatus',
        PETipoDocumentoId: 'custbody_pe_document_type',
        PEUbicacionSerieId: 'custbody_pe_ubicacion_para_serie',
        PESerieId: 'custbody_pe_serie',
        PEInformacionEntregaId: 'custbody_pe_delivery_information', 
        PENumRegistroMTC: 'custbody_pe_numero_de_registro_mtc',
        PECertificadoInscripcionTransportista:'custbody_pe_cert_insc_transportista',
        PEConductorId: 'custbody_pe_conductor', 
        PEUbicacionOrigenId: 'custbody_pe_location_source',
        PEUbigeoOrigenId: 'custbody_pe_ubigeo_punto_partida',
        PEModalidadTrasladoId: 'custbody_pe_modalidad_de_traslado',
        PEMotivoTrasladoId: 'custbody_pe_motivos_de_traslado',
        seleccionarDireccion: 'shipaddresslist',
        PEUbigeoEnvioId: 'custbody_pe_ubigeo_punto_llegada',
        pesoTotal: 'custbody_uni_peso_total',
        cubicajeTotal: 'custbody_uni_cubicaje_total',
        PETicket: 'custbody_pe_fe_ticket_id',
        department: 'department',
        classValue: 'class',
        location: 'location'
    };

    function createShippingGuide(requestData) {
        try {
            log.debug('PROCESS_STARTED', `Iniciando procesamiento para order: ${requestData.itemFulfillment.orderId}`);

            let searchConfig = null;

            /**
             * VALIDAR ESQUEMA DE ENTRADA (JSON)
             */
            const validator = new RequestValidator(schema);
            const validation = validator.validate(requestData, 'mainRequest');

            if (!validation.isValid) {
                log.error('Validación de esquema fallida', `Errores: ${validation.errors.length}`);
                const errorMessage = `Se encontraron ${validation.errors.length} error(es) en el payload:\n` +
                    validation.errors.map((err, idx) => `  ${idx + 1}. ${err}`).join('\n');

                throw error.create({
                    code: false, message: errorMessage
                });
            }

            log.debug('REQUEST_VALIDATION_SUCCESS', 'Payload JSON validado correctamente');

            /**
             * EXTRAER Y ESTRUCTURAR DATOS DEL REQUEST
             */
            log.debug('REQUEST_DATA_EXTRACTION', 'Descomponiendo estructura JSON del request en objetos internos');
            const fulfillment = requestData?.itemFulfillment;
            const localizations = requestData?.itemFulfillment?.localizations;
            const files = requestData?.itemFulfillment?.files;

            /**
             * CONSULTAR DOMINIOS DE VALORES DE INTEGRACION
             */
            log.debug('DOMAIN_VALUES_QUERY', `Consultando valores del dominio de configuración`);
            searchConfig = {
                recordType: RECORD_TYPE.DOMAIN_VALUES,
                columns: ['custrecord_dv_pe_valor'],
                filters: [['custrecord_dv_pe_codigo', 'is', 'ruta_folder_fulfillment']],
                valid: true,
                maxResults: 1
            };

            const searchDomainValues = searchCreateRecordType(searchConfig);

            if (!searchDomainValues) {
                throw error.create({ message: 'No se encontró la configuración de dominio para ruta_folder_fulfillment' });
            }

            const folderId = searchDomainValues.getValue('custrecord_dv_pe_valor');

            /**
             * BUSCAR DIRECCION DE PARTIDA Y UBIGEO
             */
            searchConfig = {
                recordType: RECORD_TYPE.LOCATION,
                columns: ['custrecord_pe_direccion_origen', 'custrecord_pe_ubigeo_ubicacion'],
                filters: [['internalid', 'anyof', localizations?.sourceLocation || null]],
                valid: true,
                maxResults: 1
            };

            const searchSourceLocation = searchCreateRecordType(searchConfig);

            /**
             * DESERIALIZACIÓN Y ESTRUCTURACIÓN DE DATOS
             */
            log.debug('DATA_DESERIALIZATION', `Estructurando datos JSON para orden: ${requestData.itemFulfillment.orderId}`);
            
            const paramsList = {
                cabecera: {
                    ordenId: fulfillment?.orderId || null, //ordenId
                    tipoOrden: fulfillment?.orderType || null,
                    numReferencia: fulfillment?.tranid || null, //numRef
                    fecha: fulfillment?.trandate ? format.parse({ value: fulfillment.trandate, type: format.Type.DATE }) : null,
                    nota: fulfillment?.memo || null,
                    direccionEnvioId: fulfillment?.shipaddress || null,
                    estado: fulfillment?.shipstatus || null,
                    PEInformacionEntregaId: fulfillment?.custbody_pe_delivery_information || null,
                    PENumRegistroMTC: fulfillment?.custbody_pe_numero_de_registro_mtc || null, 
                    PECertificadoInscripcionTransportista: fulfillment?.custbody_pe_cert_insc_transportista || null,   
                    PETipoDocumentoId: localizations?.documentType || null,
                    PEUbicacionSerieId: localizations?.serieLocation || null,
                    PESerieId: localizations?.serie || null,
                    PEConductorId: fulfillment?.custbody_pe_conductor || null,
                    PEUbicacionOrigenId: localizations?.sourceLocation || null,
                    //PEDireccionOrigen: null,
                    PEUbigeoOrigenId: searchSourceLocation ? searchSourceLocation.getValue('custrecord_pe_ubigeo_ubicacion') : null,
                    PEModalidadTrasladoId: localizations?.transportMode || null,
                    PEMotivoTrasladoId: localizations?.transportReason || null,
                    //PEdetallesMotivo: PEdetallesMotivo,           
                    seleccionarDireccion: fulfillment?.shipaddresslist || null,         
                    PEUbigeoEnvioId: fulfillment?.custbody_pe_ubigeo_punto_llegada || null, // PEubigeoPuntoLlegadaId || ubigeoLlegadaId,
                    pesoTotal: fulfillment?.custbody_uni_peso_total || null,
                    cubicajeTotal: fulfillment?.custbody_uni_cubicaje_total || null,                  
                    PETicket: localizations?.ticket || null,
                    department: null,
                    classValue: null,
                    location: null
                },
                files: {
                    printedCdrResponse: {
                        content: files?.printedCdrResponse?.content || null,
                        fileName: files?.printedCdrResponse?.fileName || null,
                        fileType: 'ZIP',
                        folderId: folderId,
                        isContent: !!files?.printedCdrResponse?.content && files?.printedCdrResponse?.fileName
                    },
                    printedPdf: {
                        content: files?.printedPdf?.content || null,
                        fileName: files?.printedPdf?.fileName || null,
                        fileType: 'PDF',
                        folderId: folderId,
                        isContent: !!files?.printedPdf?.content && files?.printedPdf?.fileName
                    },
                    printedXmlRequest: {
                        content: files?.printedXmlRequest?.content || null,
                        fileName: files?.printedXmlRequest?.fileName || null,
                        fileType: 'XML',
                        folderId: folderId,
                        isContent: !!files?.printedXmlRequest?.content && files?.printedXmlRequest?.fileName
                    },
                    printedXmlResponse: {
                        content: files?.printedXmlResponse?.content || null,
                        fileName: files?.printedXmlResponse?.fileName || null,
                        fileType: 'XML',
                        folderId: folderId,
                        isContent: !!files?.printedXmlResponse?.content && files?.printedXmlResponse?.fileName
                    }
                }
            };

            const objectHeader = paramsList?.cabecera;
            const objectFiles = paramsList?.files;

            /**
             * CARGAR Y VALIDAR FROM TYPE
             */
            log.debug('VALID_OTDER_TYPE', `Validar y cargar tipo de orden`);
            const fromType = loadAndValidateFromType(objectHeader.ordenId, objectHeader.tipoOrden, requestData.itemFulfillment.items);

            /**
             * TRANSFORMAR ORDEN A GUIA DE REMISION
             */
            log.debug('ORDER_TRANSFORMATION_START', `Transformando orden ${objectHeader.ordenId} a Item Fulfillment`);
            let itemFulfillment = record.transform({
                fromType: fromType,
                fromId: parseInt(objectHeader.ordenId),
                toType: record.Type.ITEM_FULFILLMENT,
                isDynamic: true
            });

            /**
             * CONSULTAR DIRECCION DE ENVIO Y UBIGEO PARA OTR
             */
            if (objectHeader.tipoOrden === ORDER_TYPE.OTR) {
                log.debug('SHIPPING_LOCATION_QUERY', `Consultando ubicación de envío para orden ${objectHeader.ordenId}, tipo de orden ${objectHeader.tipoOrden}`);
                paramsList.cabecera.direccionEnvioId = objectHeader.direccionEnvioId ||
                    (itemFulfillment.getValue({ fieldId: 'transferlocation' }) || null);
                searchConfig = {
                    recordType: RECORD_TYPE.LOCATION,
                    columns: ['custrecord_pe_direccion_origen'],
                    filters: [['internalid', 'anyof', objectHeader.direccionEnvioId]],
                    valid: true,
                    maxResults: 1
                };

                const searchTargetLocation = searchCreateRecordType(searchConfig);
               // paramsList.cabecera.PEUbigeoEnvioId = searchTargetLocation ? searchTargetLocation.getValue('custrecord_pe_ubigeo_ubicacion') : null;
            }

            /**
             * CONSULTAR DIRECCION DE ENVIO Y UBIGEO PARA OV Y ODV
             */
            if ([ORDER_TYPE.ODV, ORDER_TYPE.OV].includes(objectHeader.tipoOrden)) {
                log.debug('SHIPPING_LOCATION_QUERY', `Consultando ubicación de envío para orden ${objectHeader.ordenId}, tipo de orden ${objectHeader.tipoOrden}`);
                paramsList.cabecera.direccionEnvioId = objectHeader.direccionEnvioId ||
                    (itemFulfillment.getValue({ fieldId: 'addressbookaddress' }) || //shippingaddress
                        (itemFulfillment.getValue({ fieldId: 'billingaddress' }) ||
                            (itemFulfillment.getValue({ fieldId: 'shippingaddress' }) || null)));

                const customerId = itemFulfillment.getValue({ fieldId: 'entity' }) || null;

                searchConfig = {
                    recordType: RECORD_TYPE.CUSTOMER,
                    columns: [
                        search.createColumn({ name: "custrecord_pe_ubigeo", join: "Address", label: "PE Ubigeo" }) //,
                        //search.createColumn({ name: "address", join: "Address", label: "Address" })
                    ],
                    filters: [
                        ["internalid", "anyof", customerId], "AND", ["address.internalid", "anyof", objectHeader.direccionEnvioId]
                    ],
                    valid: false,
                    maxResults: 1
                };

                const searchCustomer = searchCreateRecordType(searchConfig);
                //paramsList.cabecera.PEUbigeoEnvioId = searchCustomer ? searchCustomer.getValue({ name: "custrecord_pe_ubigeo", join: "Address" }) : null;
            }

            /**
            * ASIGNACION DE DATOS PARA ORDEN DE DEVOLUCION
            */
            paramsList.cabecera.department = itemFulfillment.getValue({ fieldId: 'department' }) || null;
            paramsList.cabecera.classValue = itemFulfillment.getValue({ fieldId: 'class' }) || null;
            paramsList.cabecera.location = itemFulfillment.getValue({ fieldId: 'location' }) || null;


            const objectJSON = JSON.stringify(paramsList, (key, value) => {
                if (key === 'content' && typeof value === 'string' && value.length > 100) {
                    return `[CONTENT_TRUNCATED: ${value.length} bytes]`;
                }
                return value;
            }, 2);
            log.debug('HEADER_ASSIGNMENTS', objectJSON);

            /**
             * ACTUALIZAR PARAMETROS DE GUIA DE REMISION
             */
            Object.keys(FIELD_MAPPINGS_HEADER).forEach(fieldKey => {
                const fieldId = FIELD_MAPPINGS_HEADER[fieldKey];
                const value = paramsList.cabecera[fieldKey];
                setValueIfExists(itemFulfillment, fieldId, value);
            });

            /**
             * SUBIR ARCHIVO CDR RESPONSE
             */
            if (objectFiles.printedCdrResponse.isContent) {
                log.debug(`Subiendo CDR Response`, `File Name: ${objectFiles.printedCdrResponse.fileName}`);
                const CDR = uploadBase64File(objectFiles.printedCdrResponse);
                itemFulfillment.setValue({ fieldId: 'custbody_pe_ei_printed_cdr_res', value: CDR.fileId });
            }

            /**
             * SUBIR ARCHIVO PDF
             */
            if (objectFiles.printedPdf.isContent) {
                log.debug(`Subiendo PDF Response`, `File Name: ${objectFiles.printedPdf.fileName}`);
                const PDF = uploadBase64File(objectFiles.printedPdf);
                itemFulfillment.setValue({ fieldId: 'custbody_pe_ei_printed_pdf', value: PDF.fileId });
            }

            /**
             * SUBIR ARCHIVO XML REQUEST
             */
            if (objectFiles.printedXmlRequest.isContent) {
                log.debug(`Subiendo XML Request`, `File Name: ${objectFiles.printedXmlRequest.fileName}`);
                const XMLRequest = uploadBase64File(objectFiles.printedXmlRequest);
                itemFulfillment.setValue({ fieldId: 'custbody_pe_ei_printed_xml_req', value: XMLRequest.fileId });
            }

            /**
             * SUBIR ARCHIVO XML RESPONSE
             */
            if (objectFiles.printedXmlResponse.isContent) {
                log.debug(`Subiendo XML Response`, `File Name: ${objectFiles.printedXmlResponse.fileName}`);
                const XMLResponse = uploadBase64File(objectFiles.printedXmlResponse);
                itemFulfillment.setValue({ fieldId: 'custbody_pe_ei_printed_xml_res', value: XMLResponse.fileId });
            }

            /**
             * ACTUALIZAR CONFIGURACION DE ITEMS
             */
            log.debug('ITEM_LINES_UPDATE_START', `Actualizando líneas de items para orden: ${objectHeader.ordenId}`);
            updateItemFulfillmentLines(itemFulfillment, requestData.itemFulfillment.items);

            log.debug('ITEM_FULFILLMENT_SAVE_START', `Guardando Item Fulfillment en base de datos`);
            let itemFulfillmentId = itemFulfillment.save();
            log.debug('ITEM_FULFILLMENT_SAVE_SUCCESS', `Item Fulfillment guardado exitosamente ID: ${itemFulfillmentId}`);

            // VERIFICAR Y ACTUALIZAR TRANID SI ES NECESARIO
            try {
                const savedRecord = record.load({
                    type: record.Type.ITEM_FULFILLMENT,
                    id: itemFulfillmentId,
                    isDynamic: false
                });
                const savedTranidValue = savedRecord.getValue({ fieldId: 'tranid' });
                
                if (savedTranidValue !== paramsList.cabecera.numReferencia && paramsList.cabecera.numReferencia) {
                    // NetSuite sobrescribió el tranid con auto-numeración, actualizamos manualmente
                    savedRecord.setValue({ fieldId: 'tranid', value: paramsList.cabecera.numReferencia });
                    savedRecord.save();
                }
            } catch (e) {
                log.error('TRANID_UPDATE_ERROR', `Error actualizando tranid: ${e.message}`);
            }

            return {
                success: true,
                recordid: itemFulfillmentId
            };

        } catch (e) {
            log.error({ title: 'VALIDATION_ERROR', details: e.message });
            return {
                success: false,
                message: e.message || 'Ocurrio un error en el proceso',
                details: e.details || []
            };
        }
    }

    // Función especializada para manejar líneas de items
    function updateItemFulfillmentLines(itemFulfillment, requestItems) {
        let lineCount = itemFulfillment.getLineCount({ sublistId: 'item' });

        // Crear array con información de todas las líneas
        const mappedLines = Array.from({ length: lineCount }, (_, i) => {
            return {
                lineNumber: i,
                itemId: itemFulfillment.getSublistValue({
                    sublistId: 'item',
                    fieldId: 'item',
                    line: i
                })
            };
        });

        let usedIndexes = new Set();
        mappedLines.forEach(orderItem => {
            const index = requestItems.findIndex((req, idx) => req.itemId === orderItem.itemId && !usedIndexes.has(idx));

            // Excluir lineas que no seran procesadas
            if (index === -1) {
                itemFulfillment.selectLine({ sublistId: 'item', line: orderItem.lineNumber });
                itemFulfillment.setCurrentSublistValue({ sublistId: 'item', fieldId: 'itemreceive', value: false });
            }
            else {
                usedIndexes.add(index);

                // Seleccionar lineas que seran procesadas
                itemFulfillment.selectLine({ sublistId: 'item', line: orderItem.lineNumber });

                // Marca la linea para ser procesada
                itemFulfillment.setCurrentSublistValue({ sublistId: 'item', fieldId: 'itemreceive', value: true });

                // Obtener valores para validar si el item necesita configuracion de inventario
                let invtType = itemFulfillment.getCurrentSublistValue({ sublistId: 'item', fieldId: 'invttype' });
                let itemtype = itemFulfillment.getCurrentSublistValue({ sublistId: 'item', fieldId: 'itemtype' });

                //Actualizar la locacion            
                itemFulfillment.setCurrentSublistValue({ sublistId: 'item', fieldId: 'location', value: requestItems[index].location });

                // Actualizar cantidades
                itemFulfillment.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: requestItems[index].quantity });

                // Configurar detalle de inventario
                if (invtType === "T" && itemtype !== "Service") {
                    let inventoryDetail;

                    // Intenta crear obtener un inventory detail, sino existe lo crea
                    try {
                        inventoryDetail = itemFulfillment.getCurrentSublistSubrecord({ sublistId: 'item', fieldId: 'inventorydetail' });
                    } catch (e) {
                        inventoryDetail = itemFulfillment.createCurrentSublistSubrecord({ sublistId: 'item', fieldId: 'inventorydetail' });
                    }

                    // Eliminas el detail de la linea que se procesara
                    try {
                        let existingLines = inventoryDetail.getLineCount({ sublistId: 'inventoryassignment' });

                        // Eliminar líneas existentes
                        for (let j = existingLines - 1; j >= 0; j--) {
                            inventoryDetail.removeLine({ sublistId: 'inventoryassignment', line: j });
                        }
                    } catch (e) {
                        null; // No hay líneas existentes - continuar
                    }

                    // Existe inventory detalle de inventario
                    if (inventoryDetail) {

                        for (let itemDetail of requestItems[index].inventoryDetail) {

                            let binNumber = null, inventoryNumber = null;

                            if (itemDetail?.binNumber) {
                                const binSearchObj = search.create({
                                    type: "bin",
                                    filters:
                                        [
                                            ["binnumber", "startswith", itemDetail.binNumber || null],
                                            "AND",
                                            ["location", "anyof", requestItems[index].location]
                                        ],
                                    columns:
                                        [
                                            search.createColumn({ name: "internalid", label: "Internal ID" })
                                        ]
                                });

                                const binSearchResults = binSearchObj.run().getRange({ start: 0, end: 1 });

                                binNumber = binSearchResults[0].getValue({ name: "internalid" });
                            }

                            if (itemDetail?.serialLotNumber) {
                                const inventorynumberbinSearchObj = search.create({
                                    type: "inventorynumberbin",
                                    filters:
                                        [
                                            ["inventorynumber", "startswith", itemDetail.serialLotNumber || null],
                                            "AND",
                                            ["binnumber", "anyof", binNumber],
                                            "AND",
                                            ["location", "anyof", requestItems[index].location]
                                        ],
                                    columns:
                                        [
                                            search.createColumn({ name: "internalid", join: "inventoryNumber", label: "Internal ID" })
                                        ]
                                });

                                const inventorynumberbinSearchResults = inventorynumberbinSearchObj.run().getRange({ start: 0, end: 1 });

                                inventoryNumber = inventorynumberbinSearchResults[0].getValue({ name: "internalid", join: "inventoryNumber" });
                            }

                            inventoryDetail.selectNewLine({ sublistId: 'inventoryassignment' });

                            if (itemDetail?.serialLotNumber) {
                                inventoryDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'issueinventorynumber', value: inventoryNumber });
                            }

                            inventoryDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'binnumber', value: binNumber }); //binnumber

                            if (itemDetail?.status) {
                                inventoryDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'inventorystatus', value: itemDetail.status });
                            }

                            inventoryDetail.setCurrentSublistValue({ sublistId: 'inventoryassignment', fieldId: 'quantity', value: itemDetail.quantity });

                            inventoryDetail.commitLine({ sublistId: 'inventoryassignment' });
                        }

                    }
                }
            }

            itemFulfillment.commitLine({ sublistId: 'item' });
        });
    }

    // Buscar el registro para identificar su tipo
    function loadAndValidateFromType(orderId, typeOrder, requestItems) {
        let validationErrors = [];

        // Consulta el tipo de record type
        const searchObj = search.create({
            type: 'customrecord_ts_dom_val_reg_eje_ord',
            columns: [
                'custrecord_dv_pe_valor'
            ],
            filters: [
                ['custrecord_dv_pe_codigo', 'is', 'record_type_fulfillment'],
                'and',
                ['custrecord_dv_pe_tipo', 'is', typeOrder]
            ]
        });

        const result = searchObj.run().getRange({ start: 0, end: 1 });

        const recordType = result[0].getValue('custrecord_dv_pe_valor');

        log.debug('LOAD_ORDER', `cargando orden de trabajo ${orderId} tipo: ${typeOrder} record: ${recordType}`);
        const dataOrder = record.load({
            type: recordType,
            id: parseInt(orderId)
        });

        log.debug('LOAD_COMPLETE', `cargando orden de trabajo ${orderId} tipo: ${typeOrder}`);

        if (!dataOrder) {
            throw error.create({ message: `La orden con ID: ${orderId} no fue encontrada` });
        }

        // Asignaciones de variables
        const isClosed = dataOrder.getValue('isclosed');
        const status = dataOrder.getValue('orderstatus');
        //const shipaddress = dataOrder.getValue('shipaddress');
        const allowedStatuses = ['B', 'A', 'E']; // E = ordenes atendidas parcialmente

        // Validar si la orden se encuentra en estado cerrada
        if (isClosed) {
            validationErrors.push(`La Orden: ${orderId} está cerrada y no puede ser modificada`);
        }

        // Validar el estado de la orden
        if (!allowedStatuses.includes(status)) {
            validationErrors.push(`La Orden: ${orderId} no está en estado aprobado. Estado actual: ${status}`);
        }

        // validar las lineas de la orden
        const lineCount = dataOrder.getLineCount({ sublistId: 'item' });
        const usedIndexes = new Set();
        let validItemsCount = 0;
        for (let i = 0; i < lineCount; i++) {
            const item = dataOrder.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i });

            // Incluir solo lineas que seran procesadas
            const requestIndex = requestItems.findIndex((req, idx) => req.itemId === item && !usedIndexes.has(idx));

            if (requestIndex !== -1) {
                usedIndexes.add(requestIndex);

                const quantity = dataOrder.getSublistValue({ sublistId: 'item', fieldId: 'quantity', line: i }) || 0;
                const quantityfulfilled = dataOrder.getSublistValue({ sublistId: 'item', fieldId: 'quantityfulfilled', line: i }) || 0;
                const isLineClosed = dataOrder.getSublistValue({ sublistId: 'item', fieldId: 'isclosed', line: i });


                if (isLineClosed) {
                    validationErrors.push(`Línea ${i + 1} (Item: ${item}) está cerrada y no puede ser procesada`);
                }

                if (quantity === quantityfulfilled) {
                    validationErrors.push(`Línea ${i + 1} (Item: ${item}) no tiene cantidad disponible para enviar`);
                }

                validItemsCount++;
            }
        }

        if (validItemsCount === 0 && validationErrors.length === 0) {
            validationErrors.push(`Los items del request no coinciden con las líneas de la orden ${orderId}`);
        }

        if (validationErrors.length > 0) {
            throw error.create({
                message: `Se encontraron ${validationErrors.length} error(es) en la orden:\n` +
                    validationErrors.map((err, idx) => `  ${idx + 1}. ${err}`).join('\n'),
                details: {
                    orderId: orderId,
                    validationErrors: validationErrors
                }
            });
        }

        return recordType /*,
            searchType: searchType,
            shipaddress: shipaddress*/

    }

    function post(context) {

        


        return createShippingGuide(context);
    }

    /**
     * FUNCION DE USO GLOBAL
     * CONSULTAR RECORD TYPE CON FILTROS - METODO lookupFields
     **/
    function searchLookupFieldsRecordType(config) {
        const FN_NAME = 'lookupFieldsRecordType';

        try {
            const {
                recordType,
                columns = [],
                valueFilter,
                paramName = 'parámetro',
                isOptional = true
            } = config;

            if (isOptional && !valueFilter) {
                log.debug(`Parámetro opcional omitido`, { paramName, valueFilter });
                return null;
            }

            // Validaciones de parámetros requeridos
            if (!recordType) {
                throw new Error(`recordType es requerido fn: ${FN_NAME}`);
            }

            if (!valueFilter) {
                throw new Error(`valueFilter es requerido fn: ${FN_NAME}`);
            }

            if (!columns || columns.length === 0) {
                throw new Error(`columns no puede estar vacío fn: ${FN_NAME}`);
            }

            log.debug(`Buscando registro ${recordType}`, {
                recordType: recordType,
                valueFilter: valueFilter,
                columns: columns,
                paramName: paramName
            });

            // Ejecutar búsqueda
            const resultado = search.lookupFields({
                type: recordType,
                id: valueFilter,
                columns: columns
            });

            // Validar resultados
            if (!resultado || Object.keys(resultado).length === 0 && isOptional) {
                throw new Error(`El valor "${valueFilter}" no existe en ${recordType} fn: ${FN_NAME}`);
            }

            return resultado;

        } catch (e) {
            log.error(`Error en ${FN_NAME}`, { config: config, error: e.message });

            throw new Error(`${e.message} fn: ${FN_NAME}`);
        }
    }

    /**
     * FUNCION DE USO GLOBAL
     * CONSULTAR RECORD TYPE CON FILTROS - METODO lookupFields
     **/
    function searchCreateRecordType(config) {
        try {
            const {
                recordType,
                columns = [],
                filters = [],
                valid = true,
                maxResults = 1
            } = config;

            if (!recordType) {
                throw new Error('recordType es requerido fn: consultRecordByFilter');
            }

            if (!Array.isArray(filters)) {
                throw new Error('filters debe ser un array fn: consultRecordByFilter');
            }

            const searchObj = search.create({
                type: recordType,
                filters: filters,
                columns: columns
            });

            const results = searchObj.run().getRange({ start: 0, end: maxResults });

            // Validar resultados si es requerido
            if (valid !== false && results.length === 0) {
                throw new Error(`No se encontraron resultados ${recordType} fn: consultRecordByFilter`);
            }

            // Retornar resultado según maxResults
            return maxResults === 1 ? (results.length > 0 ? results[0] : null) : results;

        } catch (e) {
            log.error('Error en consultRecordByFilter', {
                config: config,
                error: e.message
            });
            throw error.create({ message: `fn: consultRecordByFilter. Error al consultar: ${e.message}`, details: config });
        }
    }

    /**
     * FUNCION DE USO GLOBAL
     * VALIDAR ESQUEMA
     **/
    function RequestValidator(schemas) {
        this.schemas = schemas;

        // Método auxiliar para verificar si un valor está vacío
        this.isEmpty = function (value) {
            if (value === null || value === undefined || value === '') {
                return true;
            }
            if (Array.isArray(value) && value.length === 0) {
                return true;
            }
            if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
                return true;
            }
            return false;
        };

        // Método auxiliar para verificar tipos
        this.checkType = function (value, type) {
            switch (type) {
                case 'string':
                    return typeof value === 'string';
                case 'number':
                    return typeof value === 'number' && !isNaN(value);
                case 'boolean':
                    return typeof value === 'boolean';
                case 'array':
                    return Array.isArray(value);
                case 'object':
                    return typeof value === 'object' && value !== null && !Array.isArray(value);
                default:
                    return false;
            }
        };

        this.validate = function (data, schemaName, path = '', visited = new Set()) {
            // Prevenir recursión infinita con referencias circulares
            const dataId = JSON.stringify({ schemaName, path, data: typeof data });
            if (visited.has(dataId)) {
                return { isValid: true, errors: [] }; // Ya visitado, evitar recursión
            }
            visited.add(dataId);

            const schema = this.schemas[schemaName];
            const errors = [];

            if (!schema) {
                errors.push(`Esquema de validación '${schemaName}' no encontrado`);
                return { isValid: false, errors: errors };
            }

            // Validar que no hay campos extraños en los datos (opcional, descomentar si se desea)
            /*
            for (const field in data) {
                if (!(field in schema)) {
                    const fullPath = path ? `${path}.${field}` : field;
                    errors.push(`${fullPath} no está permitido en el esquema`);
                }
            }
            */

            for (const [field, rules] of Object.entries(schema)) {
                const fullPath = path ? `${path}.${field}` : field;
                const value = data[field];
                const isPresent = field in data;

                // 1. Validar campo requerido
                if (rules.required && !isPresent) {
                    errors.push(`${fullPath} es requerido`);
                    continue;
                }

                // 2. Si no está presente y no es requerido, saltar otras validaciones
                if (!isPresent) {
                    continue;
                }

                // 3. Si el campo está presente pero vacío, saltar validaciones de valor
                if (this.isEmpty(value)) {
                    // Si es requerido y está vacío, ya se validó arriba
                    continue;
                }

                // 4. Validar tipo (esto debe hacerse antes de otras validaciones específicas)
                if (rules.type && !this.checkType(value, rules.type)) {
                    errors.push(`${fullPath} debe ser ${rules.type}`);
                    continue;
                }

                // 5. Validaciones específicas por tipo (solo si el tipo es correcto)
                if (rules.type === 'string') {
                    if (rules.minLength !== undefined && value.length < rules.minLength) {
                        errors.push(`${fullPath} debe tener al menos ${rules.minLength} caracteres`);
                    }
                    if (rules.maxLength !== undefined && value.length > rules.maxLength) {
                        errors.push(`${fullPath} debe tener máximo ${rules.maxLength} caracteres`);
                    }
                    if (rules.pattern && !rules.pattern.test(value)) {
                        errors.push(`${fullPath} no cumple el formato requerido`);
                    }
                    if (rules.enum && !rules.enum.includes(value)) {
                        errors.push(`${fullPath} debe ser uno de: ${rules.enum.join(', ')}`);
                    }
                }

                if (rules.type === 'number') {
                    if (rules.min !== undefined && value < rules.min) {
                        errors.push(`${fullPath} debe ser mayor o igual a ${rules.min}`);
                    }
                    if (rules.max !== undefined && value > rules.max) {
                        errors.push(`${fullPath} debe ser menor o igual a ${rules.max}`);
                    }
                }

                if (rules.type === 'boolean') {
                    // Validaciones específicas para booleanos si son necesarias
                    if (rules.allowedValues && !rules.allowedValues.includes(value)) {
                        errors.push(`${fullPath} debe ser uno de: ${rules.allowedValues.join(', ')}`);
                    }
                }

                // Validar array
                if (rules.type === 'array') {
                    if (rules.minItems !== undefined && value.length < rules.minItems) {
                        errors.push(`${fullPath} debe tener al menos ${rules.minItems} elementos`);
                    }
                    if (rules.maxItems !== undefined && value.length > rules.maxItems) {
                        errors.push(`${fullPath} debe tener máximo ${rules.maxItems} elementos`);
                    }
                    if (rules.itemSchema && typeof rules.itemSchema === 'string') {
                        value.forEach((item, index) => {
                            const itemValidation = this.validate(item, rules.itemSchema, `${fullPath}[${index}]`, visited);
                            if (!itemValidation.isValid) {
                                errors.push(...itemValidation.errors);
                            }
                        });
                    }
                }

                // Validar objeto con sub-esquema
                if (rules.type === 'object' && rules.itemSchema && typeof rules.itemSchema === 'string') {
                    const objectValidation = this.validate(value, rules.itemSchema, fullPath, visited);
                    if (!objectValidation.isValid) {
                        errors.push(...objectValidation.errors);
                    }
                }
            }

            return { isValid: errors.length === 0, errors: errors };
        };
    }

    // UNCIÓN AUXILIAR CORRECTA
    function getSupportedFileTypes(typeString) {
        const typeMap = {
            'PDF': file.Type.PDF,
            'XML': file.Type.XMLDOC,
            'ZIP': file.Type.ZIP,
            'JPG': file.Type.JPGIMAGE,
            'JPEG': file.Type.JPGIMAGE,
            'PNG': file.Type.PNGIMAGE,
            'TXT': file.Type.PLAINTEXT,
            'CSV': file.Type.CSV,
            'EXCEL': file.Type.EXCEL,
            'XLS': file.Type.EXCEL,
            'XLSX': file.Type.EXCEL,
            'WORD': file.Type.WORD,
            'DOC': file.Type.WORD,
            'DOCX': file.Type.WORD,
            'JSON': file.Type.JSON,
            'HTML': file.Type.HTMLDOC,
            'GIF': file.Type.GIFIMAGE
        };

        return typeMap[typeString.toUpperCase()] || file.Type.PLAINTEXT;
    }

    /**
     * FUNCION DE USO GLOBAL
     * SUBIR ARCHIVOS
     **/
    function uploadBase64File(config) {
        const FN_NAME = 'fn: uploadBase64File'
        try {
            const {
                content,
                fileName,
                fileType,
                folderId
            } = config;

            log.debug('uploadBase64File', 'Iniciando función - fileName: ' + fileName + ', fileType: ' + fileType);

            // VALIDACIONES BÁSICAS
            if (!folderId) {
                throw new Error(`Folder ID es requerido ${FN_NAME}`);
            }
            if (!content) {
                throw new Error(`Base64 data es requerido ${FN_NAME}`);
            }
            if (!fileName) {
                throw new Error(`fileName es requerido ${FN_NAME}`);
            }

            log.debug('uploadBase64File', 'Folder ID recibido: ' + folderId);

            // Limpiar base64
            const base64Clean = content.includes(',') ? content.split(',')[1] : content;

            // Obtener tipo de archivo
            const netSuiteFileType = getSupportedFileTypes(fileType);

            if (!netSuiteFileType) {
                throw new Error(`Tipo de archivo no soportado: ${fileType} ${FN_NAME}`);
            }

            log.debug('uploadBase64File', 'NetSuite File Type: ' + netSuiteFileType);

            // Crear archivo
            const newFile = file.create({
                name: fileName,
                fileType: netSuiteFileType,
                contents: base64Clean,
                folder: parseInt(folderId), // ← Asegurar que sea número
                encoding: file.Encoding.UTF8
            });

            const fileId = newFile.save();

            log.debug('uploadBase64File', 'Archivo guardado exitosamente - File ID: ' + fileId);

            return {
                fileId: fileId
            };

        } catch (e) {
            log.error('uploadBase64File - Error general', e);
            throw new Error(`${FN_NAME} Error al subir archivo: ${e.message}`);
        }
    }

    /**
     * FUNCION DE USO GLOBAL
     * ASIGNAR VALORES DE ACTUALIZACION TRANSFROM O CREATE
     **/
    function setValueIfExists(record, fieldId, value) {
        if (value !== null && value !== undefined && value !== '') {
            record.setValue({ fieldId: fieldId, value: value });
        }
    }


    return {
        post: post
    };


});