'use strict';

/**
	CommsLogService: component that will be in charge of
	executing the background mechanisms to store, delete
	and search items in the CommsLog
**/
var CommsLogService = {

	/** Constants section **/
	DBNAME: 'commsLogDB',
	STORENAME: 'logs',
	DBVERSION: 1,

	/**
		Initialises the compoment, creating or updating
		the db if needed
	**/
	init: function cls_init() {

		//Open the database
		this._openreq = mozIndexedDB.open(this.DBNAME, this.DBVERSION);

		this._openreq.onsuccess = (function dbOnSuccess() {
			this._logsDB = this._openreq.result;
		}).bind(this);
		this._openreq.onerror = (function dbOnError(e) {
			console.error('Cannot open DB:' + e);
		}).bind(this);

		//Check if we need to update the db (or create the indexes)
		this._openreq.onupgradeneeded = (function() {
			var db = this._openreq.result;

			//Dump the previous store
			if (db.objectStoreNames.contains(this.STORENAME)) {
				db.deleteObjectStore(this.STORENAME);
			}

			//Create new objectStore and add the indexes
			var objectStore = db.createObjectStore(this.STORENAME, {keyPath: 'id'}, true);
			objectStore.createIndex('contactId', 'contactId', {unique: false});
			objectStore.createIndex('service', 'service', {unique: false});
			objectStore.createIndex('timestamp', 'timestamp', {unique: false});
			objectStore.createIndex('tel', 'tel', {unique: false});
		}).bind(this);
	},

	/**
		Call this when finishing using the service
	**/
	finish: function cls_finish() {
		if (this._logsDB) {
			this._logsDB.close();
		}
	},

	/**
		Returns the current db associated to the CommsLogService.
		This is asynchronous but may respond quick if db already opened.

		The error callback is not mandatory
	**/
	getDatabase: function cls_getDatabase(callback, errorCallback) {
		if (this._logsDB) {
			callback(this._logsDB);
			return;
		}

		this._openreq.addEventListener('success', (function db_onSuccess() {
			this._openreq.removeEventListener('success', db_onSuccess);
			this.getDatabase(callback, errorCallback);
		}).bind(this));
		this._openreq.addEventListener('error', (function db_onError() {
			this._openreq.removeEventListener('error', db_onError);
			console.error('Error opening database');
			if (errorCallback) {
				errorCallback.call();
			}
		}).bind(this));
	},

	/**
		Add an item to the CommsLog
	**/
	put: function cls_add(logsEntry, success, error) {
    this.getDatabase((function(database) {
      var txn = database.transaction(this.STORENAME, IDBTransaction.READ_WRITE);
      var store = txn.objectStore(this.STORENAME);

      var setreq = store.put(logsEntry);
      setreq.onsuccess = success;
      setreq.onerror = error;
    }).bind(this));
  },

  /**
  	Get all items in the store
  **/
  getAll: function cls_getAll(onSuccess, onError) {
    this.getDatabase((function(database) {
      var txn = database.transaction(this.STORENAME, IDBTransaction.READ_ONLY);
      var store = txn.objectStore(this.STORENAME);

      //Walk the cursor and store everything in an aux variable
      var cursor = store.openCursor(null);
      var entries = [];
      cursor.onsuccess = function(event) {
        var item = event.target.result;
        if (item) {
          entries.push(item.value);
          item.continue();
        } else {
          onSuccess(entries);
        }
      };

      cursor.onerror = onError;

    }).bind(this));
  },

  /**
  	Given an index name, and key bounds return the
  	matching content
  **/
  getByIndex: function cls_getByService(indexFilter, onSuccess, onError) {
    this.getDatabase((function(database) {
      var txn = database.transaction(this.STORENAME, IDBTransaction.READ_ONLY);

      var index = txn.objectStore(this.STORENAME).index(indexFilter.getIndexName());

      var entries = [];

      var range = indexFilter.getKeyRange();
      var cursorRequest = index.openCursor(range, indexFilter.getOrder());
      cursorRequest.onerror = onError;
      cursorRequest.onsuccess = function(evt) {
        var cursor = evt.target.result;
        if (cursor) {
          entries.push(cursor.value);
          cursor.continue();
        } else {
          onSuccess(entries);
        }
      };
    }).bind(this));
  },

  /**
  	Removes a key from the store by it's id
  **/
  delete: function cls_delete(id, onSuccess, onError) {
  	this.getDatabase((function(database) {
  		var txn = database.transaction(this.STORENAME, IDBTransaction.READ_WRITE);
      var store = txn.objectStore(this.STORENAME);

      var request = store.delete(id);
      request.onerror = onError;
      request.onsuccess = onSuccess;
  	}).bind(this));
  },

  /**
  	Generates an UUID, DON'T ENSURE UNIQUE HERE.
  **/
  generateId: function cls_generateId() {
    function S4() {
       return (((1 + Math.random()) * 0x10000) | 0).toString(16).substring(1);
    }

    //Check with the database this is unique
    return (S4() + S4() + '-' + S4() + '-' + S4() + '-' + S4() + '-' + S4() + S4() + S4());
  },

  /*
  	Returns a simple log entry.

  	This is asynchronous as long as we have to check the UUID is unique
  */
  getLogEntryProperties: function cls_getLogEntryProperties(service, 
  		timestamp, 
  		onSuccess, onError) {
  	//Get the id and check if it's already in the db
  	var id = this.generateId();
  	this.getDatabase((function(database) {
  		var txn = database.transaction(this.STORENAME, IDBTransaction.READ_ONLY);
			var store = txn.objectStore(this.STORENAME);
  		var request = store.get(id);
  		request.onerror = onError;
  		request.onsuccess = (function(evt) {
  			if (request && request.result && result.id) {
  				//Ups, duplicated key
  				this.getLogEntryProperties(service, timestamp, onSuccess, onError);
  				return;
  			}

  			var entry = new LogEntryProperties(id, service, timestamp);
  			onSuccess.call(this, entry);
  		}).bind(this);
  	}).bind(this));
  }

};

/**
	Helping class to deal with
	filters by index
**/
var IndexFilter = function _indexFilter(indexName) {
	this._indexName = indexName;
	this._order = IDBCursor.PREV;
};

IndexFilter.prototype = {
	getIndexName: function if_getIndexName() {
		return this._indexName;
	},

	/**
		Set both internally to the same to create a range
		for unique value
	**/
	setFilterValue: function if_setFilterValue(value) {
		this._upperFilter = value;
		this._lowerFilter = value;
	},

	getFilterValue: function if_getFilterValue() {
		return {'upper': this._upperFilter, 'lower': this._lowerFilter};
	},

	setUpperFilterValue: function if_setUpperFilterValue(value) {
		this._upperFilter = value;
	},

	getUpperFilterValue: function if_getUpperFilterValue() {
		return this._upperFilter;
	},

	setLowerFilterValue: function if_setLowerFilterValue(value) {
		this._lowerFilter = value;
	},

	getLowerFilterValue: function if_getLowerFilterValue() {
		return this._lowerFilter;
	},

	setInvertOrder: function if_setInvertOrder() {
		this._order = this._order == IDBCursor.PREV ? IDBCursor.NEXT : IDBCursor.PREV;
	},

	getOrder: function if_getOrder() {
		return this._order;
	},

	/**
		This is the key function for this class. Returns the
		range type, depending in the previously set values
	**/
	getKeyRange: function if_getKeyRange() {
		if (!this.getUpperFilterValue() && !this.getLowerFilterValue()) {
			return null;
		}

		if (this.getUpperFilterValue() && this.getLowerFilterValue() &&
			this.getUpperFilterValue() == this.getLowerFilterValue()) {
			//Unique value
			return IDBKeyRange.only(this.getUpperFilterValue());
		} else if (this.getUpperFilterValue() && this.getLowerFilterValue()) {
			//Ranged
			return IDBKeyRange.bound(this.getLowerFilterValue(),
															this.getUpperFilterValue, false, false);
		} else if (this.getUpperFilterValue()) {
			//Till the upper value
			return IDBKeyRange.upperBound(this.getUpperFilterValue(), false);
		} else {
			//Till the lower value
			return IDBKeyRange.lowerBound(this.getLowerFilterValue(), false);
		}
	}
};

/**
	Class LogEntryProperties, holds all the information regarding
	an entry in the CommsLog, see https://wiki.mozilla.org/WebAPI/LogAPI
	for further details.
**/
var LogEntryProperties = function(id, service, timestamp) {
	this._id = id;
	this._service = service;
	this._timestamp = timestamp;
};

LogEntryProperties.prototype = {
	//Getters and setters for all the properties in the object
	get id() {
		return this._id;
	},

	get service() {
		return this._service;
	},

	get timestamp() {
		return this._timestamp;
	},

	get type() {
		return this._type;
	},

	set type(t) {
		this._type = t;
	},

	get status() {
		return this._status;
	},

	set status(s) {
		this._status = s;
	},

	get contactId() {
		return this._contactId;
	},

	set contactId(c) {
		this._contactId = c;
	},

	get tel() {
		return this._tel;
	},

	set tel(t) {
		this._tel = t;
	},

	get objectId() {
		return this._objectId;
	},

	set objectId(o) {
		this._objectId = o;
	},

	get title() {
		return this._title;
	},

	set title(t) {
		this._title = t;
	},

	get description() {
		return this._description;
	},

	set description(d) {
		this._description = d;
	},

	get extra() {
		return this._extra;
	},

	set extra(e) {
		this._extra = e;
	}

};

/**
	LogManager, component for dealing with logging operations
	from communications.

	Will use the CommsLogService as backend to store the information
	in the CommsLog.
**/
var LogManager = {

	put: function lm_put(entry) {
		//TODO: Perform several checkins in the entry object
		if (!entry) {
			return;
		}

		CommsLogService.put(entry);

	},

	delete: function lm_delete(id) {
		if (!id) {
			return;
		}

		CommsLogService.delete(id);
	},

	clear: function lm_clear(options) {
		//TODO
	},

  /*
    Replace this with dedicated search functions
    by index as long as we can search just by one
    index.
  */
	find: function lm_find(filter, success, error) {
		//the filter object can have several fields but
		//we search for one kind of, that is mapped to an index
		var indexFilter;

		if (filter.contactId) {
			indexFilter = new IndexFilter('contactId');
			indexFilter.setFilterValue(filter.contactId);
		} else if (filter.from || filter.to) {
			indexFilter = new IndexFilter('timestamp');
			if (filter.from) {
				indexFilter.setLowerFilterValue(filter.from);
			}
			if (filter.to) {
				indexFilter.setUpperFilterValue(filter.to);
			}
		} else if (filter.service) {
			indexFilter = new IndexFilter('service');
			indexFilter.setFilterValue(filter.service);
		} else if (filter.type) {
			indexFilter = new IndexFilter('type');
			indexFilter.setFilterValue(filter.type);
		}

		CommsLogService.getByIndex(indexFilter, success, error);
	}

};


var entry = {
	id: '4',
  timestamp: new Date().getTime(),
  type: 'incoming',
  status: 'missed',
  contactId: [],
  tel: ['+34957654213'],
  objectId: null,
  service: 'Telephony',
  title: '',
  description: '',
  extra: null
};

CommsLogService.init();
//CommsLogService.put(entry);
//CommsLogService.getAll(function (e) {console.log(e)});


