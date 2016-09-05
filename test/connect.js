'use strict';
var test    = require('tape');
var request = require('supertest');
var icws    = require('../lib/icws.js');
var gs      = require('fs');

var config = JSON.parse(fs.readFileSync('config.json', 'utf8'));

test('should connect with valid credentials', function(assert) {
  var icws = new ICWS.Session();

  icws.connect(config.uri, config.users.default)
  .done(function(data){
    assert.ifEmpty(!data.user);
  })
  .fail(function(err, res){
    assert.plan(2);
    assert.ifError(err, 'No error');
  });
});

test('should not connect with wrong protocol/port', function(assert) {
});

test('should not connect with empty credentials', function(assert) {
});

test('should not connect with wrong password', function(assert) {
});

test('should not connect with invalid user', function(assert) {
});

test('should not connect with expired password', function(assert) {
});

test('should not connect with unlicensed user', function(assert) {
});
