'use strict';
var chai         = require('chai');
var chai_promise = require('chai-as-promised');
chai.use(chai_promise);
var assert       = chai.assert;
var expect       = chai.expect;

import * as ICWS from '../lib/icws.js';

const config = {
  url: "https://localhost:8019",
  users: {
    default: { user: "agent", password: "1234" }
  }
};


describe('Session', function() {
  var icws = new ICWS.Session();

  beforeEach(function() { icws.disconnect(); });

  describe('#connect', function() {
    it('should not connect with wrong protocol', function() {
      return expect(icws.connect('tcp://cic.acme.org', 'agent', '1234')).to.be.rejectedWith('com.inin.icws.error.url.invalid_protocol(tcp:)');
    });

    it('should not connect with wrong port', function() {
      return expect(icws.connect('https://cic.acme.org:443', 'agent', '1234')).to.be.rejectedWith('com.inin.icws.error.url.invalid_port(443)');
    });

    it('should not connect with empty user', function() {
      return expect(icws.connect(config.url)).to.be.rejectedWith('com.inin.icws.error.connect.empty_user');
    });

    it('should not connect with empty password', function() {
      return expect(icws.connect(config.url, 'agent')).to.be.rejectedWith('com.inin.icws.error.connect.empty_password');
    });

    it('should not connect with wrong password', function() {
      //return expect(icws.connect(config.url, config.users.default.user, config.users.default.password + 'wrong')).to.be.rejectedWith('com.inin.icws.error.connect.invalid_password');
    });

    it('should not connect with invalid user', function() {
      //return expect(icws.connect(config.url, config.users.default.user + 'notexist', config.users.default.password)).to.be.rejectedWith('com.inin.icws.error.connect.invalid_user');
    });

    // pending tests...
    it('should not connect with expired password', function() {
    });

    it('should not connect with unlicensed user', function() {
    });
    // end of pending tests...

    it('should connect with valid credentials', function() {
      return icws.connect(config.url, config.users.default.user, config.users.default.password)
      .then(function(data){
        expect(data).to.have.property('id').to.be.ok;
        expect(data).to.have.property('token').to.be.ok;
        expect(data).to.have.property('cookie').to.be.ok;
        expect(data).to.have.property('ic_server').to.be.ok;
        expect(data).to.have.property('alternates').to.be.ok;
        expect(data).to.have.property('user_id').to.be.ok;
      });
    });
  });
});
