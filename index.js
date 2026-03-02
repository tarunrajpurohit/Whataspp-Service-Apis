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

app.listen(port, () => {
    console.log(`WhatsApp API service listening at http://localhost:${port}`);
});
