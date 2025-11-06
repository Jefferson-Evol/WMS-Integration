/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 */

define(['N/record', 'N/search', 'N/error', 'N/log', 'N/format'], function (record, search, error, log, format) {

    // FUNCIONES 
    const validateMandatoryFields = (requestBody) => {
        if (!requestBody) {
            log.error("Error", "No se recibió ningún dato en el request");
            throw error.create({
                name: "MISSING_REQUEST_BODY",
                message: "No se recibió ningún dato en el request"
            });
        }
        if (!requestBody.itemreceipt) {
            log.error("Error", "El campo 'itemreceipt' es obligatorio");
            throw error.create({
                name: "MISSING_ITEMRECEIPT",
                message: "El campo 'itemreceipt' es obligatorio"
            });
        }

        let itemreceipt = requestBody.itemreceipt;

        // Campos obligatorios
        const mandatoryFields = {
            customform: "customform",
            createdfrom: "createdfrom",
            trandate: "trandate",
            custbody_pe_document_type: "localizations.custbody_pe_document_type",
            custbody_pe_serie_cxp: "localizations.custbody_pe_serie_cxp",
            custbody_pe_number: "localizations.custbody_pe_number",
            tranid: "tranid"
        };

        let missingFields = Object.keys(mandatoryFields).filter(field => {
            const path = mandatoryFields[field].split('.');
            let value = itemreceipt;
            for (let p of path) {
                if (value[p] === undefined) return true;
                value = value[p];
            }
            return value === "" || value === null;
        });

        if (missingFields.length > 0) {
            let message = `Campos obligatorios faltantes: ${missingFields.join(', ')}`;
            log.error("Missing Fields", message);
            throw error.create({
                name: "MISSING_MANDATORY_FIELDS",
                message: message
            });
        }

        // Validar que createdfrom sea un ID válido
        if (isNaN(parseInt(itemreceipt.createdfrom))) {
            log.error("Error", "El campo 'createdfrom' debe ser un ID numérico válido del Orden de Traslado");
            throw error.create({
                name: "INVALID_CREATEDFROM",
                message: "El campo 'createdfrom' debe ser un ID numérico válido del Orden de Traslado"
            });
        }


        // Validar que tranid sea llenado
        if (itemreceipt.tranid.trim() === '') {
            return {
                success: false,
                message: "El campo 'tranid' es obligatorio para identificar la transacción"
            };
        }


        // Validar que el ID de la orden de traslado sea válido
        const transferOrderSearch = search.create({
            type: search.Type.TRANSFER_ORDER,
            filters: [['internalid', 'is', itemreceipt.createdfrom]],  // Filtra por el ID de la orden de traslado
            columns: ['internalid']
        });

        const results = transferOrderSearch.run().getRange({ start: 0, end: 1 });

        // Si no se encuentra la orden de traslado, lanza un error
        if (results.length === 0) {
            log.error("Error", "La orden de traslado no existe.");
            throw error.create({
                name: "INVALID_TRANSFERORDER",
                message: "La orden de traslado no existe."
            });
        }
    };

    const updateItemReceiptLines = (itemReceipt, requestItems) => {
        // Crear un mapa de los artículos en requestItems, con itemId como clave para acceso rápido
        const itemMap = requestItems.reduce((acc, item) => {
            acc[item.item] = item;
            return acc;
        }, {});

        log.debug('itemMap', itemMap);

        let lineCount = itemReceipt.getLineCount({ sublistId: 'item' });
        log.debug('lineCount', lineCount);

        // Iterar por todas las líneas de la recepción de artículos
        const mappedLines = Array.from({ length: lineCount }, (_, i) => ({
            lineNumber: i,
            item: itemReceipt.getSublistValue({ sublistId: 'item', fieldId: 'item', line: i }),
            ubicacion: itemReceipt.getSublistValue({ sublistId: 'item', fieldId: 'location', line: i }),
            cantidad: itemReceipt.getSublistValue({ sublistId: 'item', fieldId: 'quantity', line: i })
        }));

        log.debug('mappedLines', mappedLines);

        mappedLines.forEach(orderItem => {
            const requestItem = itemMap[orderItem.item];
            log.debug('Processing item', orderItem.item);

            if (!requestItem) {
                // Si el artículo no está en requestItems, desmarcarlo
                itemReceipt.selectLine({ sublistId: 'item', line: orderItem.lineNumber });
                itemReceipt.setCurrentSublistValue({ sublistId: 'item', fieldId: 'itemreceive', value: false });
                itemReceipt.commitLine({ sublistId: 'item' });
                return;
            }

            // Si encontramos el artículo en requestItems, lo procesamos
            itemReceipt.selectLine({ sublistId: 'item', line: orderItem.lineNumber });

            updateLineFields(itemReceipt, requestItem);

            updateInventoryDetail(itemReceipt, requestItem);

            itemReceipt.commitLine({ sublistId: 'item' });
        });
    };




    // Función para actualizar los campos principales de la línea de artículo
    const updateLineFields = (itemReceipt, requestItem) => {
        log.debug('requestItem 2 ', requestItem);
        itemReceipt.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: requestItem.quantity });
        itemReceipt.setCurrentSublistValue({ sublistId: 'item', fieldId: 'location', value: requestItem.location });
    };

    const updateInventoryDetail = (itemReceipt, requestItem) => {
        const invtType = itemReceipt.getCurrentSublistValue({ sublistId: 'item', fieldId: 'invttype' });
        const itemtype = itemReceipt.getCurrentSublistValue({ sublistId: 'item', fieldId: 'itemtype' });

        if (invtType === "T" && itemtype !== "Service") {
            let inventoryDetail = getOrCreateInventoryDetail(itemReceipt);

            // Eliminar líneas existentes de inventario
            removeExistingInventoryLines(inventoryDetail);

            // Si el artículo tiene detalles de inventario, agregamos los nuevos detalles
            if (requestItem.inventorydetail && requestItem.inventorydetail.length > 0) {
                addInventoryAssignment(inventoryDetail, requestItem);
            } else {
                log.debug("No se encontraron detalles de inventario para el artículo", requestItem.item);
            }
        } else {
            log.debug("Artículo de tipo 'Service', no se procesarán detalles de inventario", requestItem.item);
        }
    };

    // Función para obtener o crear el subregistro de detalle de inventario
    const getOrCreateInventoryDetail = (itemReceipt) => {
        try {
            return itemReceipt.getCurrentSublistSubrecord({ sublistId: 'item', fieldId: 'inventorydetail' });
        } catch (e) {
            return itemReceipt.createCurrentSublistSubrecord({ sublistId: 'item', fieldId: 'inventorydetail' });
        }
    };


    // Función para eliminar las líneas de inventario existentes
    const removeExistingInventoryLines = (inventoryDetail) => {
        try {
            const existingLines = inventoryDetail.getLineCount({ sublistId: 'inventoryassignment' });
            for (let j = existingLines - 1; j >= 0; j--) {
                inventoryDetail.removeLine({ sublistId: 'inventoryassignment', line: j });
            }
        } catch (e) {
            // Si no hay líneas existentes, continuar sin hacer nada
        }
    };

    // Función para agregar una nueva línea de inventario
    const addInventoryAssignment = (inventoryDetail, requestItem) => {
        requestItem.inventorydetail.forEach(inventoryData => {
            inventoryDetail.selectNewLine({ sublistId: 'inventoryassignment' });

            inventoryDetail.setCurrentSublistValue({
                sublistId: 'inventoryassignment',
                fieldId: 'receiptinventorynumber',
                value: inventoryData.receiptinventorynumber
            });


            inventoryDetail.setCurrentSublistValue({
                sublistId: 'inventoryassignment',
                fieldId: 'binnumber',
                value: inventoryData.binnumber
            });


            inventoryDetail.setCurrentSublistValue({
                sublistId: 'inventoryassignment',
                fieldId: 'quantity',
                value: inventoryData.quantity
            });

            inventoryDetail.setCurrentSublistValue({
                sublistId: 'inventoryassignment',
                fieldId: 'inventorystatus',
                value: inventoryData.inventorystatus
            });

            const expDate = format.parse({
                value: inventoryData.expirationdate,
                type: format.Type.DATE
            });

            inventoryDetail.setCurrentSublistValue({
                sublistId: 'inventoryassignment',
                fieldId: 'expirationdate',
                value: expDate
            });

            inventoryDetail.commitLine({ sublistId: 'inventoryassignment' });
        });
    };


    // POST
    const post = (requestBody) => {
        let response = {
            status: false,
            message: 'Default message'
        };

        try {

            // Validar que itemreceipt esté presente
            if (!requestBody || !requestBody.itemreceipt) {
                log.error('Error', 'El campo itemreceipt no está presente en el cuerpo de la solicitud');
                return {
                    status: false,
                    message: 'El campo itemreceipt no está presente en el cuerpo de la solicitud'
                };
            }

            // Validar que items esté presente

            if (!requestBody.itemreceipt.items || requestBody.itemreceipt.items.length === 0) {
                log.error('Error', 'El campo "items" está vacío o no existe');
                return {
                    status: false,
                    message: 'El campo "items" está vacío o no existe'
                };
            }


            // Validar campos obligatorios
            validateMandatoryFields(requestBody)

            // Asignación explícita para claridad
            let itemreceipt = requestBody.itemreceipt;

            // ID de la orden de traslado
            let transferOrderId = itemreceipt.createdfrom;

            // Transformar la orden de compra a una recepción de artículos
            let itemReceipt = record.transform({
                fromType: record.Type.TRANSFER_ORDER,
                fromId: transferOrderId,
                toType: record.Type.ITEM_RECEIPT,
                isDynamic: true
            });

            // Información principal
            itemReceipt.setValue({ fieldId: 'customform', value: itemreceipt.customform });
            itemReceipt.setValue({ fieldId: 'createdfrom', value: itemreceipt.createdfrom });

            log.debug('itemreceipt inicial', itemreceipt);

            log.debug('tranid ingresado', itemreceipt.tranid);


            // Validar que el tranid no exista ya en el sistema
            const existingAdjustment = search.create({
                type: search.Type.ITEM_RECEIPT,
                filters: [
                    ['tranid', 'is', itemreceipt.tranid]
                ],
                columns: ['internalid', 'tranid']
            }).run().getRange({ start: 0, end: 1 });

            if (existingAdjustment && existingAdjustment.length > 0) {
                return {
                    success: false,
                    message: `El tranid '${itemreceipt.tranid}' ya existe en el sistema (ID: ${existingAdjustment[0].id})`
                };
            }

            itemReceipt.setValue({ fieldId: 'tranid', value: itemreceipt.tranid });

            let fecha = itemreceipt.trandate;

            // Formatear fecha
            const fechaFormateada = format.parse({
                value: fecha,
                type: format.Type.DATE
            });

            itemReceipt.setValue({ fieldId: 'trandate', value: fechaFormateada });

            itemReceipt.setValue({ fieldId: 'memo', value: itemreceipt.memo });

            // Clasificación           
            itemReceipt.setValue({ fieldId: 'subsidiary', value: itemreceipt.subsidiary });
            itemReceipt.setValue({ fieldId: 'department', value: itemreceipt.department });
            itemReceipt.setValue({ fieldId: 'class', value: itemreceipt.class });

            // PE Localización
            itemReceipt.setValue({ fieldId: 'custbody_pe_document_type', value: itemreceipt.localizations.custbody_pe_document_type });
            itemReceipt.setValue({ fieldId: 'custbody_pe_serie_cxp', value: itemreceipt.localizations.custbody_pe_serie_cxp });
            itemReceipt.setValue({ fieldId: 'custbody_pe_number', value: itemreceipt.localizations.custbody_pe_number });

            // ususario
            itemReceipt.setValue({ fieldId: 'custbody_uni_usuario_unibell', value: itemreceipt.usuarioUnibell });

            updateItemReceiptLines(itemReceipt, itemreceipt.items);

            let idSaved = itemReceipt.save({
                enableSourcing: true,
                ignoreMandatoryFields: false
            });

            return {
                success: true,
                recordid: parseInt(idSaved)
            };

        } catch (e) {
            log.error('Error en el POST', {
                message: e.message,
                stack: e.stack
            });
            return {
                status: false,
                message: e.message || 'Error inesperado'
            };
        }
    };

    return {
        post
    };
});