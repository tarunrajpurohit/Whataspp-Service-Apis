require('dotenv').config();
const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

// Enable JSON body parsing
app.use(express.json());

app.post('/api/send-message', async (req, res) => {
    try {
        const { phoneNumber, templateId, parameters } = req.body;

        if (!phoneNumber || !templateId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters. Both phoneNumber and templateId are required.'
            });
        }

        const token = process.env.WHATSAPP_TOKEN;
        const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

        if (!token || !phoneNumberId) {
            return res.status(500).json({
                success: false,
                error: 'WhatsApp API credentials are not configured properly.'
            });
        }

        const apiUrl = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;

        const requestBody = {
            messaging_product: 'whatsapp',
            to: phoneNumber,
            type: 'template',
            template: {
                name: templateId,
                language: {
                    code: 'en_US' // Default language code, can be made dynamic later
                }
            }
        };

        // Add parameters if provided
        if (parameters && Array.isArray(parameters) && parameters.length > 0) {
            requestBody.template.components = [
                {
                    type: 'body',
                    parameters: parameters.map(param => {
                        // Default to text if type is not provided
                        const paramType = param.type || 'text';
                        return {
                            type: paramType,
                            [paramType]: param.value
                        };
                    })
                }
            ];
        }

        const response = await axios.post(apiUrl, requestBody, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        res.status(200).json({
            success: true,
            data: response.data,
            message: 'WhatsApp message sent successfully!'
        });

    } catch (error) {
        console.error('Error sending WhatsApp message:', error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json({
            success: false,
            error: error.response ? error.response.data : 'Internal server error while sending message.'
        });
    }
});

app.post('/api/send-bulk-messages', async (req, res) => {
    try {
        const { templateId, recipients } = req.body;

        if (!templateId || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters. templateId and a non-empty recipients array are required.'
            });
        }

        const token = process.env.WHATSAPP_TOKEN;
        const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

        if (!token || !phoneNumberId) {
            return res.status(500).json({
                success: false,
                error: 'WhatsApp API credentials are not configured properly.'
            });
        }

        const apiUrl = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;

        const sendPromises = recipients.map(async (recipient) => {
            const requestBody = {
                messaging_product: 'whatsapp',
                to: recipient.phoneNumber,
                type: 'template',
                template: {
                    name: templateId,
                    language: {
                        code: 'en_US' // Default language code, can be made dynamic later
                    }
                }
            };

            // Add parameters if provided for this recipient
            if (recipient.parameters && Array.isArray(recipient.parameters) && recipient.parameters.length > 0) {
                requestBody.template.components = [
                    {
                        type: 'body',
                        parameters: recipient.parameters.map(param => {
                            // Default to text if type is not provided
                            const paramType = param.type || 'text';
                            return {
                                type: paramType,
                                [paramType]: param.value
                            };
                        })
                    }
                ];
            }

            try {
                const response = await axios.post(apiUrl, requestBody, {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                });
                return {
                    phoneNumber: recipient.phoneNumber,
                    status: 'success',
                    data: response.data
                };
            } catch (error) {
                return {
                    phoneNumber: recipient.phoneNumber,
                    status: 'failed',
                    error: error.response ? error.response.data : error.message
                };
            }
        });

        // Use Promise.allSettled to ensure all are processed even if some fail
        const results = await Promise.allSettled(sendPromises);

        const details = results.map(r => r.value);
        const successful = details.filter(d => d.status === 'success').length;
        const failed = details.filter(d => d.status === 'failed').length;

        const summary = {
            total: recipients.length,
            successful,
            failed,
            details
        };

        res.status(200).json({
            success: true,
            summary,
            message: 'Bulk WhatsApp message processing completed.'
        });

    } catch (error) {
        console.error('Error in bulk send:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error while processing bulk messages.'
        });
    }
});

app.get('/api/templates', async (req, res) => {
    try {
        const token = process.env.WHATSAPP_TOKEN;
        const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

        if (!token || !businessAccountId) {
            return res.status(500).json({
                success: false,
                error: 'WhatsApp API credentials (WHATSAPP_TOKEN or WHATSAPP_BUSINESS_ACCOUNT_ID) are not configured properly.'
            });
        }

        // WhatsApp graph API endpoint for fetching message templates
        const apiUrl = `https://graph.facebook.com/v17.0/${businessAccountId}/message_templates`;

        const response = await axios.get(apiUrl, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        res.status(200).json({
            success: true,
            data: response.data,
            message: 'WhatsApp templates fetched successfully!'
        });

    } catch (error) {
        console.error('Error fetching WhatsApp templates:', error.response ? error.response.data : error.message);
        res.status(error.response ? error.response.status : 500).json({
            success: false,
            error: error.response ? error.response.data : 'Internal server error while fetching templates.'
        });
    }
});

app.post('/api/webhooks/shopify/customer-created', async (req, res) => {
    try {
        const customer = req.body;
        console.log('Received Shopify customer/created webhook for customer ID:', customer.id, customer);

        // Acknowledge webhook immediately so Shopify doesn't timeout
        res.status(200).json({ success: true, message: 'Webhook received' });

        // Check if customer note contains "exh_customer"
        if (customer.note && customer.note.includes('exh_customer')) {
            const phoneNumber = customer.phone || (customer.default_address && customer.default_address.phone);

            if (phoneNumber) {
                // Clean phone number (remove +, -, spaces, etc.)
                // const cleanPhoneNumber = phoneNumber.replace(/[^0-9]/g, '');
                const cleanPhoneNumber = 6350182509;
                const templateId = "hello_world";

                if (templateId) {
                    try {
                        // Call the local /api/send-message endpoint
                        const apiUrl = `https://whataspp-service-apis.onrender.com/api/send-message`;
                        await axios.post(apiUrl, {
                            phoneNumber: cleanPhoneNumber,
                            templateId: templateId,
                            parameters: [
                                {
                                    type: 'text',
                                    value: customer.first_name || 'Customer'
                                }
                            ]
                        });
                        console.log(`Successfully triggered send-message for Shopify customer ${customer.id}`);
                    } catch (err) {
                        console.error('Error calling /api/send-message:', err.response ? err.response.data : err.message);
                    }
                } else {
                    console.log('Missing SHOPIFY_WELCOME_TEMPLATE_ID. Skipping message.');
                }
            } else {
                console.log(`No phone number found for Shopify customer ${customer.id}`);
            }
        }

    } catch (error) {
        console.error('Error processing Shopify customer webhook:', error.response ? error.response.data : error.message);
        if (!res.headersSent) {
            res.status(500).json({ success: false, error: 'Internal server error while processing webhook' });
        }
    }
});

app.listen(port, () => {
    console.log(`WhatsApp API service listening at http://localhost:${port}`);
});
