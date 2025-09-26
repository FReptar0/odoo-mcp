import pkg from 'xmlrpc';
const { createClient } = pkg;
import * as http from 'http';
import * as https from 'https';
import { OdooConfig, OdooResponse, OdooSearchParams } from '../types/odoo.js';

export class OdooClient {
  private commonClient: any;
  private objectClient: any;
  private uid: number | null = null;

  static validateAndSuggestUrls(configUrl: string): { isValid: boolean; suggestions: string[] } {
    const suggestions: string[] = [];
    let isValid = true;

    try {
      const url = new URL(configUrl);

      // Common URL corrections
      if (url.pathname === '/' || url.pathname === '') {
        suggestions.push(`${configUrl.replace(/\/$/, '')}/xmlrpc/2/common`);
      }

      if (!url.port) {
        suggestions.push(`${url.protocol}//${url.hostname}:8069/xmlrpc/2/common`);
        suggestions.push(`${url.protocol}//${url.hostname}:443/xmlrpc/2/common`);
      }

      // Common Odoo deployment patterns
      const baseUrl = `${url.protocol}//${url.hostname}${url.port ? ':' + url.port : ''}`;
      suggestions.push(
        `${baseUrl}/xmlrpc/2/common`,
        `${baseUrl}:8069/xmlrpc/2/common`,
        `${baseUrl}/odoo/xmlrpc/2/common`,
        `${baseUrl}/web/xmlrpc/2/common`
      );

    } catch (e) {
      isValid = false;
      // Try to fix common URL mistakes
      if (!configUrl.startsWith('http')) {
        suggestions.push(`https://${configUrl}/xmlrpc/2/common`);
        suggestions.push(`http://${configUrl}:8069/xmlrpc/2/common`);
      }
    }

    return { isValid, suggestions: [...new Set(suggestions)] };
  }

  constructor(private config: OdooConfig) {
    console.error(`[OdooClient] Connecting to ${config.url} using working system approach`);

    // Use working system's simple approach
    this.commonClient = createClient({
      url: config.url + '/xmlrpc/2/common'
    });

    this.objectClient = createClient({
      url: config.url + '/xmlrpc/2/object'
    });

    console.error(`[OdooClient] Created clients for common and object endpoints`);
  }

  async testHttpEndpoint(path: string): Promise<OdooResponse<any>> {
    const url = new URL(this.config.url);
    const isSecure = url.protocol === 'https:';
    const port = parseInt(url.port) || (isSecure ? 443 : 8069);

    console.error(`[OdooClient] Testing HTTP endpoint: ${url.protocol}//${url.hostname}:${port}${path}`);

    return new Promise((resolve) => {
      const requestModule = isSecure ? https : http;

      const options = {
        hostname: url.hostname,
        port: port,
        path: path,
        method: 'POST', // XML-RPC requires POST
        headers: {
          'User-Agent': 'Odoo-MCP-Client/1.0',
          'Content-Type': 'text/xml',
          'Content-Length': '0'
        },
        timeout: 10000,
        ...(isSecure && {
          rejectUnauthorized: false
        })
      };

      const req = requestModule.request(options, (res) => {
        console.error(`[OdooClient] HTTP ${res.statusCode} - Content-Type: ${res.headers['content-type']}`);

        // For XML-RPC endpoints, 400/500 with empty body is expected (no valid XML sent)
        // 200 is also good. 404/405 means wrong endpoint.
        if (res.statusCode === 200 || res.statusCode === 400 || res.statusCode === 500) {
          resolve({
            success: true,
            data: {
              status: res.statusCode,
              contentType: res.headers['content-type'],
              headers: res.headers
            }
          });
        } else if (res.statusCode === 405) {
          resolve({
            success: false,
            error: `HTTP 405: XML-RPC endpoint found but method not allowed. This usually means the endpoint is correct but needs proper XML-RPC requests.`
          });
        } else {
          resolve({
            success: false,
            error: `HTTP ${res.statusCode}: ${res.statusMessage}. Check if XML-RPC is enabled on this Odoo instance.`
          });
        }
      });

      req.on('error', (error) => {
        console.error(`[OdooClient] HTTP request failed:`, error);
        resolve({
          success: false,
          error: `HTTP request failed: ${error.message}. Check URL and network connectivity.`
        });
      });

      req.on('timeout', () => {
        console.error(`[OdooClient] HTTP request timed out`);
        req.destroy();
        resolve({
          success: false,
          error: 'HTTP request timed out. Server might be overloaded or unreachable.'
        });
      });

      req.end();
    });
  }

  async inspectResponseBody(path: string): Promise<string> {
    const url = new URL(this.config.url);
    const isSecure = url.protocol === 'https:';
    const port = parseInt(url.port) || (isSecure ? 443 : 8069);

    return new Promise((resolve) => {
      const requestModule = isSecure ? https : http;

      const options = {
        hostname: url.hostname,
        port: port,
        path: path,
        method: 'POST',
        headers: {
          'User-Agent': 'Odoo-MCP-Client/1.0',
          'Content-Type': 'text/xml',
          'Content-Length': '0'
        },
        timeout: 5000,
        ...(isSecure && {
          rejectUnauthorized: false
        })
      };

      const req = requestModule.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });

        res.on('end', () => {
          console.error(`[OdooClient] Response body (first 500 chars):`, body.substring(0, 500));
          resolve(body);
        });
      });

      req.on('error', () => {
        resolve('Unable to fetch response body');
      });

      req.on('timeout', () => {
        req.destroy();
        resolve('Response body fetch timed out');
      });

      req.end();
    });
  }

  async validateXmlRpcResponse(error: any, result: any, operation: string): Promise<OdooResponse<any>> {
    if (error) {
      console.error(`[OdooClient] ${operation} XML-RPC error:`, error);

      // Check if error indicates HTML response
      if (error.message && error.message.includes('Unknown XML-RPC tag')) {
        const htmlTag = error.message.match(/Unknown XML-RPC tag '([^']+)'/)?.[1];
        console.error(`[OdooClient] Server returned non-XML-RPC content (found tag: ${htmlTag})`);

        // Get the actual response body to see what's being returned
        const responseBody = await this.inspectResponseBody('/xmlrpc/2/common');

        // Test the endpoint to see what's actually there
        const httpTest = await this.testHttpEndpoint('/xmlrpc/2/common');

        let detailedError = `Server returned non-XML-RPC response (found <${htmlTag}> tag). `;

        if (!httpTest.success) {
          detailedError += `\n\nEndpoint test failed: ${httpTest.error}`;
        } else {
          const contentType = httpTest.data?.contentType || 'unknown';
          detailedError += `\n\nEndpoint returns Content-Type: ${contentType}`;

          // Analyze the response body
          if (responseBody.includes('<title>') || responseBody.includes('<TITLE>')) {
            const titleMatch = responseBody.match(/<title[^>]*>([^<]+)<\/title>/i);
            const title = titleMatch ? titleMatch[1].trim() : 'Unknown';
            detailedError += `\n\nPage title: "${title}"`;

            if (title.toLowerCase().includes('404') || title.toLowerCase().includes('not found')) {
              detailedError += `\n\nThis is a 404 error page. The XML-RPC endpoint doesn't exist at this URL.`;
            } else if (title.toLowerCase().includes('login') || title.toLowerCase().includes('sign in')) {
              detailedError += `\n\nThis is a login page. You may need to authenticate at the web server level first.`;
            } else if (title.toLowerCase().includes('error') || title.toLowerCase().includes('exception')) {
              detailedError += `\n\nThis appears to be an error page from Odoo.`;
            }
          }

          if (contentType.includes('text/xml')) {
            detailedError += `\n\nThe Content-Type suggests this should be XML-RPC, but the response contains HTML elements.
This usually means:
1. Odoo is returning an error page in XML format
2. Wrong database name or XML-RPC path
3. Odoo configuration issue

Check your ODOO_DATABASE setting and ensure XML-RPC is properly configured.`;
          } else if (contentType.includes('text/html')) {
            const urlSuggestions = OdooClient.validateAndSuggestUrls(this.config.url);

            detailedError += `\n\nThis suggests:
1. URL might be pointing to Odoo web interface instead of XML-RPC endpoint
2. XML-RPC might be disabled on this Odoo instance
3. Authentication might be required at web server level
4. Wrong port or path

Try these URLs in your .env file:`;

            urlSuggestions.suggestions.slice(0, 5).forEach((suggestion, index) => {
              detailedError += `\n${index + 1}. ODOO_URL=${suggestion.replace('/xmlrpc/2/common', '')}`;
            });

            detailedError += `\n\nOr check if XML-RPC is enabled in Odoo configuration.`;
          }
        }

        return {
          success: false,
          error: detailedError
        };
      }

      return {
        success: false,
        error: `${operation} failed: ${error.message || error.code || 'Unknown error'}`
      };
    }

    return {
      success: true,
      data: result
    };
  }

  async testConnection(): Promise<OdooResponse<any>> {
    console.error(`[OdooClient] Testing connection to ${this.config.url}`);

    // Test XML-RPC directly (skip HTTP test for now since 405 is common)
    return new Promise(async (resolve) => {
      const timeout = setTimeout(() => {
        console.error(`[OdooClient] XML-RPC connection test timed out after 10 seconds`);
        resolve({
          success: false,
          error: 'XML-RPC connection test timed out - check your Odoo URL and network connectivity'
        });
      }, 10000);

      this.commonClient.methodCall('version', [], async (error: any, result: any) => {
        clearTimeout(timeout);

        const validationResult = await this.validateXmlRpcResponse(error, result, 'Connection test');

        if (validationResult.success) {
          console.error(`[OdooClient] Connection successful. Odoo version:`, result);
        }

        resolve(validationResult);
      });
    });
  }

  async authenticate(): Promise<OdooResponse<number>> {
    console.error(`[OdooClient] Authenticating user: ${this.config.username} on database: ${this.config.database}`);

    return new Promise(async (resolve) => {
      const timeout = setTimeout(() => {
        console.error(`[OdooClient] Authentication timed out after 15 seconds`);
        resolve({
          success: false,
          error: 'Authentication timed out - check your credentials and Odoo server status'
        });
      }, 15000);

      this.commonClient.methodCall('authenticate', [
        this.config.database,
        this.config.username,
        this.config.password,
        {}
      ], async (error: any, uid: number) => {
        clearTimeout(timeout);

        const validationResult = await this.validateXmlRpcResponse(error, uid, 'Authentication');

        if (validationResult.success) {
          if (!uid) {
            console.error(`[OdooClient] Authentication returned no UID - invalid credentials`);
            resolve({
              success: false,
              error: 'Invalid credentials or API key. Check your username, database name, and API key.'
            });
          } else {
            console.error(`[OdooClient] Authentication successful. User ID: ${uid}`);
            this.uid = uid;
            resolve({
              success: true,
              data: uid
            });
          }
        } else {
          resolve(validationResult);
        }
      });
    });
  }

  async searchRead<T = any>(
    model: string,
    params: OdooSearchParams = {}
  ): Promise<OdooResponse<T[]>> {
    console.error(`[OdooClient] SearchRead on model: ${model}`);

    // Authenticate directly if not authenticated (skip connection test)
    if (!this.uid) {
      console.error(`[OdooClient] Not authenticated, authenticating...`);
      const authResult = await this.authenticate();
      if (!authResult.success) {
        return {
          success: false,
          error: authResult.error
        };
      }
    }

    const {
      domain = [],
      fields = [],
      limit = 100,
      offset = 0,
      order = 'id desc'
    } = params;

    console.error(`[OdooClient] Search parameters:`, {
      model,
      domain,
      fields: fields.length > 0 ? fields : 'all',
      limit,
      offset,
      order
    });

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        console.error(`[OdooClient] SearchRead timed out after 20 seconds`);
        resolve({
          success: false,
          error: 'Search operation timed out - the query may be too complex or the server is overloaded'
        });
      }, 20000);

      this.objectClient.methodCall('execute_kw', [
        this.config.database,
        this.uid,
        this.config.password,
        model,
        'search_read',
        [domain],
        {
          fields: fields.length > 0 ? fields : undefined,
          limit,
          offset,
          order
        }
      ], async (error: any, result: T[]) => {
        clearTimeout(timeout);

        const validationResult = await this.validateXmlRpcResponse(error, result, 'SearchRead');

        if (validationResult.success) {
          console.error(`[OdooClient] SearchRead successful. Found ${result?.length || 0} records`);
          resolve({
            success: true,
            data: result || []
          });
        } else {
          resolve(validationResult);
        }
      });
    });
  }

  async count(model: string, domain: any[] = []): Promise<OdooResponse<number>> {
    if (!this.uid) {
      const authResult = await this.authenticate();
      if (!authResult.success) {
        return {
          success: false,
          error: authResult.error
        };
      }
    }

    return new Promise((resolve) => {
      this.objectClient.methodCall('execute_kw', [
        this.config.database,
        this.uid,
        this.config.password,
        model,
        'search_count',
        [domain]
      ], (error: any, result: number) => {
        if (error) {
          resolve({
            success: false,
            error: `Count failed: ${error.message}`
          });
        } else {
          resolve({
            success: true,
            data: result
          });
        }
      });
    });
  }

  async getFields(model: string): Promise<OdooResponse<any>> {
    if (!this.uid) {
      const authResult = await this.authenticate();
      if (!authResult.success) {
        return {
          success: false,
          error: authResult.error
        };
      }
    }

    return new Promise((resolve) => {
      this.objectClient.methodCall('execute_kw', [
        this.config.database,
        this.uid,
        this.config.password,
        model,
        'fields_get',
        [],
        {}
      ], (error: any, result: any) => {
        if (error) {
          resolve({
            success: false,
            error: `Fields retrieval failed: ${error.message}`
          });
        } else {
          resolve({
            success: true,
            data: result
          });
        }
      });
    });
  }
}