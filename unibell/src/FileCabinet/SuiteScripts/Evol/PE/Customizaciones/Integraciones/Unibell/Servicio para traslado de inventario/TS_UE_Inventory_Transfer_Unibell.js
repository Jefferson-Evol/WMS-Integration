/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['N/error', 'N/format', 'N/log', 'N/record', 'N/search'],
    /**
 * @param{error} error
 * @param{format} format
 * @param{log} log
 * @param{record} record
 * @param{search} search
 */
    (error, format, log, record, search) => {
        /**
         * Defines the function definition that is executed before record is loaded.
         * @param {Object} scriptContext
         * @param {Record} scriptContext.newRecord - New record
         * @param {string} scriptContext.type - Trigger type; use values from the context.UserEventType enum
         * @param {Form} scriptContext.form - Current form
         * @param {ServletRequest} scriptContext.request - HTTP request information sent from the browser for a client action only.
         * @since 2015.2
         */
     
        const afterSubmit = (scriptContext) => {

        }

        return { afterSubmit}

    });
