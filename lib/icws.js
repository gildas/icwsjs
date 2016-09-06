"use strict";
export { Session, Error, VERSION }
const VERSION = '0.0.1';

var url     = require('url');

function is_blank(value) { return !!value === false || (typeof value === 'string' && !!value.trim() == false); }

function ICWSError(id, information = {}) {
  this.message = id;
  this.information = information || {};
  this.stack = (new Error()).stack;
}
ICWSError.prototype = Object.create(Error.prototype);
ICWSError.prototype.constructor = ICWSError;

class Rest {
  constructor(session)
  {
    this.session = session;
  }

  log(message) {
    console.log(message);
  }

  post(path, json)   { return this.request('POST', path, json); }
  get(path)          { return this.request('GET', path); }
  update(path, json) { return this.request('UPDATE', path, json); }
  patch(path, json)  { return this.request('PATCH', path, json); }
  delete(path)       { return this.request('DELETE', path); }

  request(verb, path, json) {
    var self = this;

    return new Promise((resolve, reject) => {
      var   request_body    = undefined;
      var   request_headers = { 'Accept-Language': self.session.language };
      const request_path    = '/icws' + (self.session.is_connected ? '/' + self.session.id : '') + path;

      if (!is_blank(json)) {
        request_body  = JSON.stringify(json);
        request_headers['Content-Type']   = 'application/json';
        request_headers['Content-Length'] = Buffer.byteLength(request_body);
      }

      if (self.session.token)  { request_headers['ININ-ICWS-CSRF-Token'] = self.session.token; }
      if (self.session.cookie) { request_headers['Cookie']               = self.session.cookie; }
      self.log(`request verb:    ${verb}`);
      self.log(`request path:    ${request_path}`);
      self.log(`request headers: ${JSON.stringify(request_headers)}`);
      self.log(`request body:    ${request_body}`);
      const response_body = [];
      const httplib = self.session.url.protocol === 'http:' ? require('http') : require('https');

      // Check if DNS resolves
      // Check if server replies to connect
      const request = httplib.request({
          hostname:           self.session.url.hostname,
          protocol:           self.session.url.protocol,
          port:               self.session.url.port,
          method:             verb,
          path:               request_path,
          headers:            request_headers,
          rejectUnauthorized: false,
          // If we have a self signed root CA:
          //ca: self_signed_root_ca_pem_cert,
          // If we have a cert:
          //key: client_pem_key,
          //cert: client_pem_cert_self_signed,
      }, (response) => {
        self.log(`response Status: ${response.statusCode}`);
        self.log(`response Headers: ${JSON.stringify(response.headers)}`);
        response.setEncoding('utf8');
        // Possible errors:
        // DNS failures
        // PRoxy Name resolution failure
        // Connect failure
        // timeout failure
        response.on('data', (chunk) => response_body.push(chunk));
        response.on('end',  ()      => {
          var data = (response_body.length > 0) ? JSON.parse(response_body.join('')) : {};

          self.log('response.body: ' + JSON.stringify(data));
          switch (response.statusCode)
          {
            case 204: // NoContent
              self.log("Resovling with no content (204)");
              resolve();
              break;
            case 201: // Created
              self.log("Resovling with created (201)");
              data.cookie = response.headers['set-cookie'][0];
              self.log('Cookie: ' + data.cookie);
              // TODO: Reject if there is no cookie?
              resolve(data);
              break;
            case 500: // Internal Server Error
            case 410: // Gone
            case 405: // Method not allowed
            case 404: // Not Found
            case 401: // Unauthorized
            case 400: // Bad Request
            case 202: // Accepted
            case 200: // OK
            default:
              if (response.statusCode >= 200 && response.statusCode < 300) {
                self.log("Resovling with status code " + response.statusCode);
                resolve(data);
              } else {
                data.http_status = response.statusCode;
                if (data.errorId === "error.request.unsupported") {
                  self.log(`Rejecting with method not allowed, verb: ${verb}, path: ${path} (${response.statusCode})`);
                  reject(new ICWSError('com.inin.icws.error.method_not_allowed', {error_id: data.errorId, error_code: data.errorCode, error_message: data.message, http_status: data.http_status, verb: verb, path: path}));
                } else if (data.errorId === "error.request.accessDenied.httpMethodNotAllowed") {
                  self.log(`Rejecting with method not allowed, verb: ${verb}, path: ${path} (${response.statusCode})`);
                  reject(new ICWSError('com.inin.icws.error.method_not_allowed', {error_id: data.errorId, error_code: data.errorCode, error_message: data.message, http_status: data.http_status, verb: verb, path: path}));
                } else if (data.errorId === "error.request.connection.authenticationFailure") {
                  self.log("Rejecting with authentication failure (" + response.statusCode + ')');
                  reject(new ICWSError('com.inin.icws.error.connect.invalid_credentials', {error_id: data.errorId, error_code: data.errorCode, error_message: data.message, http_status: data.http_status}));
                } else if (   data.errorCode === 2    // Session was not found
                           || data.errorCode === 7) { // Access Denied
                  self.log("Rejecting with invalid session (" + response.statusCode + ')');
                  reject(new ICWSError('com.inin.icws.error.connect.invalid_session', {error_id: data.errorId, error_code: data.errorCode, error_message: data.message, http_status: data.http_status}));
                } else {
                  self.log("Rejecting with status code " + response.statusCode);
                  reject(new ICWSError('com.inin.icws.error.request.unknown_error', data));
                }
              }
              break;
          }
        });
      });
      request.on('error', (err) => {
        self.log("Error: " + err);
        reject(err);
      });
      if (request_body !== undefined) { request.write(request_body); }
      request.end();
    });
  }
}

class Session {
  constructor() {
    this.url         = undefined;
    this.rest        = undefined;
    this.application = 'icws_client';
    this.language    = 'en-US';
    this.session_id  = undefined;
    this.token       = undefined;
    this.cookie      = undefined;
  }

  /**
   * @description tells if the session is connected to a CIC server
   * @return {boolean} True if the session is connected
   **/
  get is_connected() { return this.session_id !== undefined }

  /**
   * @description gives the session identifier
   * @return {string} id
   **/
  get id() { return this.session_id }

  /**
   * @description connect to a CIC server
   * @param {string} server      The CIC server's URl. If a server name/IP is given, https:// is prepended and :8019 is added.
   * @param {string} user        The user to connect with
   * @param {string} password    The user's password
   * @param {string} application The name of this application
   * @param {string} language    The locale to use with CIC (Default: 'en-US')
   * @param {string} marketPlace The Interactive Intelligence's market place license, if any
   **/
  connect(server, user, password, application, language = 'en-US', marketPlace) {
    var self = this;

    return new Promise((resolve, reject) => {
      // basic validation
      if (is_blank(server))   { return reject(new ICWSError('com.inin.icws.error.connect.empty_server')); }
      if (is_blank(user))     { return reject(new ICWSError('com.inin.icws.error.connect.empty_user')); }
      if (is_blank(password)) { return reject(new ICWSError('com.inin.icws.error.connect.empty_password')); }

      self.url = url.parse(server);

      // validations
      if (self.url.protocol !== 'http:' && self.url.protocol !== 'https:') { return reject(new ICWSError('com.inin.icws.error.url.invalid_protocol', {protocol: self.url.protocol})) }
      if (self.url.port === 0) { self.url.port = (self.url.protocol === 'http') ? '8018' : '8019'; }
      if (self.url.port !== '8018' && self.url.port !== '8019') { return reject(new ICWSError('com.inin.icws.error.url.invalid_port', {port: self.url.port})); }
      if (self.url.protocol === 'http:'  && self.url.port !== '8018') { return reject(new ICWSError('com.inin.icws.error.url.invalid_port', {port: self.url.port})); }
      if (self.url.protocol === 'https:' && self.url.port !== '8019') { return reject(new ICWSError('com.inin.icws.error.url.invalid_port', {port: self.url.port})); }
      if (!is_blank(application)) { self.application = application; }
      if (!is_blank(language))    { self.language    = language;    }

      // Connecting
      self.log('Connecting to ' + server + ' as ' + user);
      return new Rest(self).post('/connection', {
          __type:          'urn:inin.com:connection:icAuthConnectionRequestSettings',
          applicationName: self.application,
          userID:          user,
          password:        password,
          //marketPlaceApplicationLicenseName: inputs.market_license,
          //marketPlaceApplicationCode:        inputs.market_code,
      })
      .then((data) => {
        self.log ("Connection data: " + JSON.stringify(data));
        self.session_id = data.sessionId;
        self.token      = data.csrfToken;
        self.cookie     = data.cookie;
        self.alternates = data.alternateHostList;
        self.user_id    = data.userID;
        self.ic_server  = data.icServer;
        resolve(self);
      })
      .catch(reject);
    });
  }

  /**
   * @description disconnect from a CIC server
   **/
  disconnect() {
    if (! this.is_connected) { return; }
    var self = this;

    self.log(`Session ${self.id} is connected, disconnecting...`);
    return new Promise((resolve, reject) => {
      return new Rest(self).delete('/connection')
      .then((data) => {
        self.session_id = undefined;
        self.token      = undefined;
        self.cookie     = undefined;
        resolve(self)
      })
      .catch(reject);;
    });
  }

  log(message) {
    console.log(message);
  }
}
