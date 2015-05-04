'use strict';

var EventEmitter = require('events').EventEmitter,
    util = require('util'),
    _ = require('lodash');

function ConnectionCollection() {
    this.connections = {};

    this.get = this.get.bind(this);
    this.getUsers = this.getUsers.bind(this);
    this.getUserIds = this.getUserIds.bind(this);

    this.add = this.add.bind(this);
    this.remove = this.remove.bind(this);
    this.removeAll = this.removeAll.bind(this);
}

ConnectionCollection.prototype.get = function(connectionId) {
    return this.connections[connectionId];
};

ConnectionCollection.prototype.contains = function(connection) {
    if (!connection) {
        return false;
    }

    return !!this.connections[connection.id];
};

ConnectionCollection.prototype.getUsers = function() {
    return _.chain(this.connections)
        .filter(function(value) {
            // User shouldn't be undefined - but sometimes it happens :/
            return value.user;
        })
        .map(function(value) {
            return value.user;
        })
        .uniq('id')
        .value();
};

ConnectionCollection.prototype.getUserIds = function() {
    return _.map(this.getUsers(), function(user) {
        return user.id;
    });
};

ConnectionCollection.prototype.getUsernames = function() {
    return _.map(this.getUsers(), function(user) {
        return user.username;
    });
};

ConnectionCollection.prototype.query = function(options) {
    if (options.userId) {
        options.userId = options.userId.toString();
    }

    return _.map(this.connections, function(value, key) {
        return value;
    }).filter(function(conn) {
        var result = true;

        if (options.user) {
            var u = options.user;
            if (conn.user && conn.user.id !== u && conn.user.username !== u) {
                result = false;
            }
        }

        if (options.userId && conn.user && conn.user.id !== options.userId) {
            result = false;
        }

        if (options.type && conn.type !== options.type) {
            result = false;
        }

        return result;
    });
};

ConnectionCollection.prototype.add = function(connection) {
    this.connections[connection.id] = connection;
};

ConnectionCollection.prototype.remove = function(connection) {
    if (!connection) {
        return;
    }

    var connId = typeof connection === 'string' ? connection : connection.id;
    if (this.connections[connId]) {
        delete this.connections[connId];
        return true;
    } else {
        return false;
    }
};

ConnectionCollection.prototype.removeAll = function() {
    var keys = Object.keys(this.connections);

    keys.forEach(function(key) {
        delete this.connections[key];
    }, this);

    return true;
};

module.exports = ConnectionCollection;
