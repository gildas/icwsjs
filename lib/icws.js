"use strict";
export { Session, Error, VERSION }
const VERSION = '0.0.1';

var url     = require('url');

function is_blank(value) { return !!value === false || (typeof value === 'string' && !!value.trim() == false); }

function ICWSError(id) {
  if (arguments.length > 1) {
    this.message = id + '(' + [...arguments].slice(1).join(',') + ')';
  } else {
    this.message = id;
  }
  this.stack = (new Error()).stack;
}
ICWSError.prototype = Object.create(Error.prototype);
ICWSError.prototype.constructor = ICWSError;

class Session {
  constructor() {
    this.url         = undefined;
    this.rest        = undefined;
    this.application = 'icws_client';
    this.language    = 'en-US';
    this.token       = undefined;
    this.cookie      = undefined;
  }

  /**
   * @description tells if the session is connected to a CIC server
   * @return {boolean} True if the session is connected
   **/
  get is_connected() { return !!this.token === false }

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
      if (self.url.protocol !== 'http:' && self.url.protocol !== 'https:') { return reject(new ICWSError('com.inin.icws.error.url.invalid_protocol', self.url.protocol)) }
      if (self.url.port === 0) { self.url.port = (self.url.protocol === 'http') ? '8018' : '8019'; }
      if (self.url.port !== '8018' && self.url.port !== '8019') { return reject(new ICWSError('com.inin.icws.error.url.invalid_port', self.url.port)); }
      if (self.url.protocol === 'http:'  && self.url.port !== '8018') { return reject(new ICWSError('com.inin.icws.error.url.invalid_port', self.url.port)); }
      if (self.url.protocol === 'https:' && self.url.port !== '8019') { return reject(new ICWSError('com.inin.icws.error.url.invalid_port', self.url.port)); }
      if (!is_blank(application)) { self.application = application; }
      if (!is_blank(language))    { self.language    = language;    }

      self.rest = self.url.protocol === 'http:' ? require('http') : require('https');

      // Connecting
      self.log('Connecting to ' + server + ' as ' + user);
      self.post('/icws/connection', {
          __type:          'urn:inin.com:connection:icAuthConnectionRequestSettings',
          applicationName: self.application,
          userID:          user,
          password:        password,
          //marketPlaceApplicationLicenseName: inputs.market_license,
          //marketPlaceApplicationCode:        inputs.market_code,
      })
      .then(resolve)
      .catch(reject);
    });
  }

  /**
   * @description disconnect from a CIC server
   **/
  disconnect() {
    if (! this.is_connected) { return; }
  }

  log(message) {
    console.log(message);
  }

  post(path, json) {
    var self = this;

    return new Promise((resolve, reject) => {
      const request_body  = JSON.stringify(json);
      const response_body = [];
      var   headers = {
            'Accept-Language': self.language,
            'Content-Type':    'application/json',
            'Content-Length':  Buffer.byteLength(request_body),
      };

      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      if (self.token)  { headers['ININ-ICWS-CSRF-Token'] = self.token; }
      if (self.cookie) { headers['Cookie']               = self.cookie; }
      self.log(`request body: ${request_body}`);
      const request = self.rest.request({
          hostname: self.url.hostname,
          protocol: self.url.protocol,
          port:     self.url.port,
          method:   'POST',
          path:     path,
          headers:  headers,
      }, (response) => {
        self.log(`HTTP Status: ${response.statusCode}`);
        self.log(`HTTP Headers: $(JSON.stringify(response.headers)}`);
        response.setEncoding('utf8');
        if (response.statusCode < 200 || response.statusCode > 299) {
          reject(new ICWSError('com.inin.icws.rest.error', response.statusCode));
        }
        response.on('end',resolve);
      });
      request.on('error', (err) => reject(err));
      request.write(request_body);
      request.end();
    });
  }

  get(path) {
    var self = this;

    return new Promise((resolve, reject) => {
      const response_body = [];
      var   headers = {
            'Accept-Language': self.language,
            'Content-Type':    'application/json',
            'Content-Length':  Buffer.byteLength(request_body),
      };

      if (! self.token)  { reject(new ICWSError('com.inin.icws.request.empty_token')); }
      if (! self.cookie) { reject(new ICWSError('com.inin.icws.request.empty_cookie')); }
      headers['ININ-ICWS-CSRF-Token'] = self.token;
      headers['Cookie']               = self.cookie;
      const request = self.rest.request({
          hostname: self.url.hostname,
          protocol: self.url.protocol,
          port:     self.url.port,
          method:   'GET',
          path:     path,
          headers:  headers,
      }, (response) => {
        self.log(`HTTP Status: ${response.statusCode}`);
        self.log(`HTTP Headers: $(JSON.stringify(response.headers)}`);
        response.setEncoding('utf8');
        if (response.statusCode < 200 || response.statusCode > 299) {
          reject(new ICWSError('com.inin.icws.rest.error', response.statusCode));
        }
        response.on('data', (chunk) => body.push(chunk));
        response.on('end',  ()      => resolve(body.join('')));
      });
      request.on('error', (err) => reject(err));
      request.write(request_body);
      request.end();
    });
  }
}
