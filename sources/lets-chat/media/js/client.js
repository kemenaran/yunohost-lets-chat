//
// LCB Client
//

(function(window, $, _) {
    //
    // Base
    //
    var Client = function(options) {
        this.options = options;
        this.status = new Backbone.Model();
        this.user = new UserModel();
        this.users = new UsersCollection();
        this.rooms = new RoomsCollection();
        this.events = _.extend({}, Backbone.Events);
        return this;
    };
    //
    // Account
    //
    Client.prototype.getUser = function() {
        var that = this;
        this.socket.emit('account:whoami', function(user) {
            that.user.set(user);
        });
    };
    Client.prototype.updateProfile = function(profile) {
        var that = this;
        this.socket.emit('account:profile', profile, function(user) {
            that.user.set(user);
        });
    };

    //
    // Rooms
    //
    Client.prototype.createRoom = function(data) {
        var that = this;
        var room = {
            name: data.name,
            slug: data.slug,
            description: data.description
        };
        var callback = data.callback;
        this.socket.emit('rooms:create', room, function(room) {
            if (room && room.errors) {
                swal("Unable to create room",
                     "Room slugs can only contain lower case letters, numbers or underscores!",
                     "error");
            } else if (room && room.id) {
                that.addRoom(room);
                that.switchRoom(room.id);
            }
            callback && callback(room);
        });
    };
    Client.prototype.getRooms = function(cb) {
        var that = this;
        this.socket.emit('rooms:list', { users: true }, function(rooms) {
            that.rooms.set(rooms);
            // Get users for each room!
            // We do it here for the room browser
            _.each(rooms, function(room) {
                if (room.users) {
                    that.setUsers(room.id, room.users);
                }
            });

            if (cb) {
                cb(rooms);
            }
        });
    };
    Client.prototype.switchRoom = function(id) {
        // Make sure we have a last known room ID
        this.rooms.last.set('id', this.rooms.current.get('id'));
        if (!id || id === 'list') {
            this.rooms.current.set('id', 'list');
            this.router.navigate('!/', {
                replace: true
            });
            return;
        }
        var room = this.rooms.get(id);
        if (room && room.get('joined')) {
            this.rooms.current.set('id', id);
            this.router.navigate('!/room/' + room.id, {
                replace: true
            });
            return;
        } else {
            this.joinRoom(id, true);
        }
    };
    Client.prototype.updateRoom = function(room) {
        this.socket.emit('rooms:update', room);
    };
    Client.prototype.roomUpdate = function(resRoom) {
        var room = this.rooms.get(resRoom.id);
        if (!room) {
            // Nothing to do
            return;
        }
        room.set(resRoom);
    };
    Client.prototype.addRoom = function(room) {
        var r = this.rooms.get(room.id);
        if (r) {
            return r;
        }
        return this.rooms.add(room);
    };
    Client.prototype.archiveRoom = function(options) {
        this.socket.emit('rooms:archive', options, function(data) {
            if (data !== 'No Content') {
                swal('Unable to Archive!',
                     'Unable to archive this room!',
                     'error');
            }
        });
    }
    Client.prototype.roomArchive = function(room) {
        this.leaveRoom(room.id);
        this.rooms.remove(room.id);
    };
    Client.prototype.rejoinRoom = function(id) {
        this.joinRoom(id, undefined, true);
    };
    Client.prototype.joinRoom = function(id, switchRoom, rejoin) {
        var that = this;

        // We need an id and unlocked joining
        if (!id || _.contains(this.joining, id)) {
            // Nothing to do
            return;
        }

        if (!rejoin) {
            // Must not have already joined
            var room = that.rooms.get(id);
            if (room && room.get('joined')) {
                return;
            }
        }

        //
        // Setup joining lock
        //
        this.joining = this.joining || [];
        this.joining.push(id);
        this.socket.emit('rooms:join', id, function(resRoom) {
            // Room was likely archived if this returns
            if (!resRoom) {
                return;
            }
            var room = that.addRoom(resRoom);
            room.set('joined', true);
            // Get room history
            that.getMessages({
                room: room.id,
                since_id: room.lastMessage.get('id'),
                take: 200,
                expand: 'owner, room',
                reverse: true
            }, function(messages) {
                messages.reverse();
                that.addMessages(messages, !rejoin && !room.lastMessage.get('id'));
                !rejoin && room.lastMessage.set(messages[messages.length - 1]);
            });
            if (that.options.filesEnabled) {
                that.getFiles({
                    room: room.id,
                    take: 15
                }, function(files) {
                    files.reverse();
                    that.setFiles(room.id, files);
                });
            }
            // Do we want to switch?
            if (switchRoom) {
                that.switchRoom(id);
            }
            //
            // Add room id to localstorage so we can reopen it on refresh
            //
            var openRooms = store.get('openrooms');
            if (openRooms instanceof Array) {
                // Check for duplicates
                if (!_.contains(openRooms, id)) {
                    openRooms.push(id);
                }
                store.set('openrooms', openRooms);
            } else {
                store.set('openrooms', [id]);
            }

            // Remove joining lock
            _.defer(function() {
                that.joining = _.without(that.joining, id);
            });
        });
    };
    Client.prototype.leaveRoom = function(id) {
        var room = this.rooms.get(id);
        if (room) {
            room.set('joined', false);
            room.lastMessage.clear();
        }
        this.socket.emit('rooms:leave', id);
        if (id === this.rooms.current.get('id')) {
            var room = this.rooms.get(this.rooms.last.get('id'));
            this.switchRoom(room && room.get('joined') ? room.id : '');
        }
        // Remove room id from localstorage
        store.set('openrooms', _.without(store.get('openrooms'), id));
    };
    Client.prototype.getRoomUsers = function(id, callback) {
        this.socket.emit('rooms:users', {
            room: id
        }, callback);
    };
    //
    // Messages
    //
    Client.prototype.addMessage = function(message) {
        var room = this.rooms.get(message.room);
        if (!room || !message) {
            // Unknown room, nothing to do!
            return;
        }
        room.set('lastActive', message.posted);
        if (!message.historical) {
            room.lastMessage.set(message);
        }
        room.trigger('messages:new', message);
    };
    Client.prototype.addMessages = function(messages, historical) {
        _.each(messages, function(message) {
            if (historical) {
                message.historical = true;
            }
            this.addMessage(message);
        }, this);
    };
    Client.prototype.sendMessage = function(message) {
        this.socket.emit('messages:create', message);
    };
    Client.prototype.getMessages = function(query, callback) {
        this.socket.emit('messages:list', query, callback);
    };
    //
    // Files
    //
    Client.prototype.getFiles = function(query, callback) {
        this.socket.emit('files:list', {
            room: query.room || '',
            take: query.take || 40,
            expand: query.expand || 'owner'
        }, callback);
    };
    Client.prototype.setFiles = function(roomId, files) {
        if (!roomId || !files || !files.length) {
            // Nothing to do here...
            return;
        }
        var room = this.rooms.get(roomId);
        if (!room) {
            // No room
            return;
        }
        room.files.set(files);
    };
    Client.prototype.addFile = function(file) {
        var room = this.rooms.get(file.room);
        if (!room) {
            // No room
            return;
        }
        room.files.add(file);
    };
    //
    // Users
    //
    Client.prototype.setUsers = function(roomId, users) {
        if (!roomId || !users || !users.length) {
            // Data is not valid
            return;
        }
        var room = this.rooms.get(roomId);
        if (!room) {
            // No room
            return;
        }
        room.users.set(users);
    };
    Client.prototype.addUser = function(user) {
        var room = this.rooms.get(user.room);
        if (!room) {
            // No room
            return;
        }
        room.users.add(user);
    };
    Client.prototype.removeUser = function(user) {
        var room = this.rooms.get(user.room);
        if (!room) {
            // No room
            return;
        }
        room.users.remove(user.id);
    };
    Client.prototype.updateUser = function(user) {
        // Update if current user
        if (user.id == this.user.id) {
            this.user.set(user);
        }
        // Update all rooms
        this.rooms.each(function(room) {
            var target = room.users.findWhere({
                id: user.id
            });
            target && target.set(user);
        }, this);
    };
    Client.prototype.getUsersSync = function() {
        if (this.users.length) {
            return this.users;
        }

        var that = this;

        function success(users) {
            that.users.set(users);
        }

        $.ajax({url:'./users', async: false, success: success});

        return this.users;
    };
    //
    // Extras
    //
    Client.prototype.getEmotes = function(callback) {
        this.extras = this.extras || {};
        if (!this.extras.emotes) {
            // Use AJAX, so we can take advantage of HTTP caching
            // Also, it's a promise - which ensures we only load emotes once
            this.extras.emotes = $.get('./extras/emotes');
        }
        if (callback) {
            this.extras.emotes.done(callback);
        }
    };
    Client.prototype.getReplacements = function(callback) {
        this.extras = this.extras || {};
        if (!this.extras.replacements) {
            // Use AJAX, so we can take advantage of HTTP caching
            // Also, it's a promise - which ensures we only load emotes once
            this.extras.replacements = $.get('./extras/replacements');
        }
        if (callback) {
            this.extras.replacements.done(callback);
        }
    };

    //
    // Router Setup
    //
    Client.prototype.route = function() {
        var that = this;
        var Router = Backbone.Router.extend({
            routes: {
                '!/room/': 'list',
                '!/room/:id': 'join',
                '*path': 'list'
            },
            join: function(id) {
                that.switchRoom(id);
            },
            list: function() {
                that.switchRoom('list');
            }
        });
        this.router = new Router();
        Backbone.history.start();
    };
    //
    // Listen
    //
    Client.prototype.listen = function() {
        var that = this;

        function joinRooms(rooms) {
            //
            // Join rooms from localstorage
            // We need to check each room is available before trying to join
            //
            var roomIds = _.map(rooms, function(room) {
                return room.id;
            });

            var openRooms = store.get('openrooms');
            if (openRooms instanceof Array) {
                // Flush the stored array
                store.set('openrooms', []);

                openRooms = _.uniq(openRooms);
                // Let's open some rooms!
                _.each(openRooms, function(id) {
                    if (roomIds.indexOf(id) !== -1) {
                        that.joinRoom(id);
                    }
                });
            }
        }

        var path = '/' + _.compact(
            window.location.pathname.split('/').concat(['socket.io'])
        ).join('/');

        //
        // Socket
        //
        this.socket = io.connect({
            path: path,
            reconnection: true,
            reconnectionDelay: 500,
            reconnectionDelayMax: 1000,
            timeout: 3000
        });
        this.socket.on('connect', function() {
            that.getUser();
            that.getRooms(joinRooms);
            that.status.set('connected', true);
        });
        this.socket.on('reconnect', function() {
            _.each(that.rooms.where({ joined: true }), function(room) {
                that.rejoinRoom(room.id);
            });
        });
        this.socket.on('messages:new', function(message) {
            that.addMessage(message);
        });
        this.socket.on('rooms:new', function(data) {
            that.addRoom(data);
        });
        this.socket.on('rooms:update', function(room) {
            that.roomUpdate(room);
        });
        this.socket.on('rooms:archive', function(room) {
            that.roomArchive(room);
        });
        this.socket.on('users:join', function(user) {
            that.addUser(user);
        });
        this.socket.on('users:leave', function(user) {
            that.removeUser(user);
        });
        this.socket.on('users:update', function(user) {
            that.updateUser(user);
        });
        this.socket.on('files:new', function(file) {
            that.addFile(file);
        });
        this.socket.on('disconnect', function() {
            that.status.set('connected', false);
        });
        //
        // GUI
        //
        this.events.on('messages:send', this.sendMessage, this);
        this.events.on('rooms:update', this.updateRoom, this);
        this.events.on('rooms:leave', this.leaveRoom, this);
        this.events.on('rooms:create', this.createRoom, this);
        this.events.on('rooms:switch', this.switchRoom, this);
        this.events.on('rooms:archive', this.archiveRoom, this);
        this.events.on('profile:update', this.updateProfile, this);
    };
    //
    // Start
    //
    Client.prototype.start = function() {
        this.getEmotes();
        this.getReplacements();
        this.listen();
        this.route();
        this.view = new window.LCB.ClientView({
            client: this
        });
        return this;
    };
    //
    // Add to window
    //
    window.LCB = window.LCB || {};
    window.LCB.Client = Client;
})(window, $, _);
