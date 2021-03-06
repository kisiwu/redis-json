'use strict';

var util = require('util');

/*! *****************************************************************************
Copyright (c) Microsoft Corporation. All rights reserved.
Licensed under the Apache License, Version 2.0 (the "License"); you may not use
this file except in compliance with the License. You may obtain a copy of the
License at http://www.apache.org/licenses/LICENSE-2.0

THIS CODE IS PROVIDED ON AN *AS IS* BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, EITHER EXPRESS OR IMPLIED, INCLUDING WITHOUT LIMITATION ANY IMPLIED
WARRANTIES OR CONDITIONS OF TITLE, FITNESS FOR A PARTICULAR PURPOSE,
MERCHANTABLITY OR NON-INFRINGEMENT.

See the Apache Version 2.0 License for specific language governing permissions
and limitations under the License.
***************************************************************************** */
function __awaiter(thisArg, _arguments, P, generator) {
  return new (P || (P = Promise))(function (resolve, reject) {
    function fulfilled(value) {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    }

    function rejected(value) {
      try {
        step(generator["throw"](value));
      } catch (e) {
        reject(e);
      }
    }

    function step(result) {
      result.done ? resolve(result.value) : new P(function (resolve) {
        resolve(result.value);
      }).then(fulfilled, rejected);
    }

    step((generator = generator.apply(thisArg, _arguments || [])).next());
  });
}

/**
 * Return the given key if it's a string else
 * parses it into number
 *
 * @param key
 *
 * @returns a string if it cannot be parsed to a number
 *           else returns the parsed number
 */
function parseKey(key) {
    const numKey = Number(key);
    return isNaN(numKey) ? decodeKey(key) : numKey;
}
/**
 * Encapsulate '.' in the given key, such
 * that a '.' in the key is NOT misinterpreted
 * during unflattening of the object
 *
 * @param key
 */
function encodeKey(key) {
    return key.replace(/\./g, '/.');
}
/**
 * Recover the actual key which was encoded earlier.
 * This is done to allow a '.' in the key
 *
 * @param key
 */
function decodeKey(key) {
    return key ? key.replace(/\/\./g, '.') : key;
}
const splitKey = (() => {
    const keySplitReg = /(?<!\/)\./;
    /**
     * Splits the the given key based
     * on the delimiter ('.')
     *
     * @param key
     */
    return (key) => {
        return key.split(keySplitReg);
    };
})();

var TYPE;
(function (TYPE) {
    TYPE["OBJECT"] = "0";
    TYPE["STRING"] = "1";
    TYPE["NUMBER"] = "2";
    TYPE["BOOLEAN"] = "3";
    TYPE["FUNCTION"] = "4";
    TYPE["UNDEFINED"] = "5";
    TYPE["SYMBOL"] = "6";
})(TYPE || (TYPE = {}));
/**
 * Returns true if the constructor name is known
 * to us. Ex: Object, Array
 */
const isKnownContructor = (() => {
    const knownConstructors = {
        Object: true,
        Array: true,
    };
    return (constructorName) => knownConstructors[constructorName];
})();
/**
 * Returns true if the given value's
 * type need to be skipped during storage.
 * For ex: Symbol -> Since symbols are private,
 * we DO NOT encourage them to be stored, hence
 * we are skipping from storing the same.
 *
 * In case you've forked this library and want to
 * add more type, then this is the place for you 🙂
 */
const isSkippedType = (() => {
    const skippedType = {
        symbol: true,
    };
    return (val) => !!skippedType[typeof val];
})();
/**
 * Returns a shorter form of the type of the
 * value that can be stored in redis.
 *   This also handles custom Classes by using
 * their constructor names directly.
 *
 * @param val Value whose type needs to be computed
 */
const getTypeOf = (() => {
    const shortTypes = {
        object: TYPE.OBJECT,
        string: TYPE.STRING,
        number: TYPE.NUMBER,
        boolean: TYPE.BOOLEAN,
        function: TYPE.FUNCTION,
        undefined: TYPE.UNDEFINED,
        symbol: TYPE.SYMBOL,
    };
    return (val) => {
        if (typeof val === 'object') {
            // If the val is `null`
            if (!val) {
                return TYPE.OBJECT;
            }
            const constructorName = val.constructor.name;
            return isKnownContructor(constructorName)
                // if the val is {} or []
                ? TYPE.OBJECT
                // if the val is Date or other custom classes / object
                : constructorName;
        }
        return shortTypes[typeof val] || TYPE.STRING /** this is a fallback, just in case */;
    };
})();
/**
 * Returns the stringified version of the given value.
 * However note that this method needs to take care,
 * such that special values like undefined, null, false, true
 * etc are also stringified correctly for storage.
 *
 * In case of a custom class / object, this method would
 * call the provided stringifier (if any available), else
 * would use `String(val)`
 *
 * @param val Value to be evaluated
 * @param stringifier Custom stringifiers
 *
 * @returns Stringified value. If null is returned, then such a value must NOT
 * be stored
 */
const getValueOf = (val, stringifier = {}) => {
    var _a;
    if (typeof val === 'object') {
        // if the val is null
        if (!val) {
            return 'null';
        }
        const constructorName = (_a = val === null || val === void 0 ? void 0 : val.constructor) === null || _a === void 0 ? void 0 : _a.name;
        return isKnownContructor(constructorName)
            // if the val is {} or []
            ? JSON.stringify(val)
            // if the val is Date or other custom classes / object
            : stringifier[constructorName]
                ? stringifier[constructorName](val)
                : String(val);
    }
    return String(val);
};
/**
 * Converts the given value to the specified type.
 *   Also note that, if a custom className type is
 * detected, then the provided custom Parser will
 * be called (if any available), else will return
 * the value as is.
 */
const getTypedVal = (() => {
    const internalParsers = {
        [TYPE.STRING]: val => val,
        [TYPE.NUMBER]: Number,
        [TYPE.BOOLEAN]: (val) => val === 'true',
        [TYPE.FUNCTION]: val => val,
        [TYPE.UNDEFINED]: () => undefined,
        [TYPE.SYMBOL]: (val) => val,
        [TYPE.OBJECT]: (() => {
            const valMap = {
                '{}': () => ({}),
                '[]': () => [],
                'null': () => null,
            };
            return (val) => valMap[val]();
        })(),
    };
    return (type, val, parser = {}) => {
        return internalParsers[type]
            ? internalParsers[type](val)
            : parser[type]
                ? parser[type](val)
                : val;
    };
})();

const getDefaultResult = () => ({
    data: {},
    typeInfo: {},
});
/**
 * @internal
 *
 * Class for flattening and unflattening an object / array
 *
 * This could've been a simple function but is rather a class
 * because we are instantiating it during the constructor phase of
 * JSONCache class by calling it with stringifier & parser options.
 */
class Flattener {
    constructor(stringifier = {}, parser = {}) {
        this.stringifier = stringifier;
        this.parser = parser;
    }
    /**
     * Flattens the given object and converts it
     * to a dept of 1
     *
     * @param obj Object to be flattened
     */
    flatten(obj) {
        return this.traverse(obj, '', getDefaultResult());
    }
    /**
     * Unflattens the given object to its original
     * format and also applies the necessary types
     * that it originally had
     *
     * @param flattened Flattened object
     */
    unflatten(flattened) {
        const typedData = this.mergeTypes(flattened);
        let result;
        Object.entries(typedData).some(([key, val]) => {
            // if the key is '', it means that
            // the flattened object / array is empty
            if (!key) {
                result = val;
                return true;
            }
            const splittedKeys = splitKey(key);
            if (!result) {
                result = typeof parseKey(splittedKeys[0]) === 'number' ? [] : {};
            }
            this.scaffoldStructure(result, splittedKeys, val);
            return false;
        });
        return result;
    }
    /***********************************
     * PRIVATE METHODS - Flatten helpers
     **********************************/
    traverse(target, basePath, result) {
        if (!(target instanceof Object))
            return result;
        const entries = Object.entries(target);
        const constructorName = target.constructor.name;
        if (entries.length > 0 && !this.stringifier[constructorName]) {
            entries.forEach(([key, val]) => {
                const encodedKey = encodeKey(key);
                const path = appendPath(basePath, encodedKey);
                if (val instanceof Object) {
                    this.traverse(val, path, result);
                }
                else {
                    this.assignResult(result, path, val);
                }
            });
        }
        else {
            this.assignResult(result, basePath, target);
        }
        return result;
    }
    assignResult(result, path, val) {
        if (!isSkippedType(val)) {
            result.data[path] = getValueOf(val, this.stringifier);
            result.typeInfo[path] = getTypeOf(val);
        }
    }
    /*************************************
     * PRIVATE METHODS - Unflatten helpers
     *************************************/
    mergeTypes(result) {
        const { data, typeInfo } = result;
        return Object.entries(data).reduce((merged, [path, val]) => {
            merged[path] = getTypedVal(typeInfo[path], val, this.parser);
            return merged;
        }, {});
    }
    scaffoldStructure(tree, splittedKeys, val) {
        // Loop until k1 has reached end of split
        for (let i = 0, len = splittedKeys.length; i < len; i++) {
            const k1 = parseKey(splittedKeys[i]);
            const k2 = parseKey(splittedKeys[i + 1]);
            if (typeof k2 === 'undefined') {
                tree[k1] = val;
            }
            else {
                const isObj = typeof tree[k1] === 'object';
                if (!isObj)
                    tree[k1] = typeof k2 === 'number' ? [] : {};
                tree = tree[k1];
            }
        }
    }
}
function appendPath(basePath, key) {
    return basePath ? `${basePath}.${key}` : key;
}

const SCAN_COUNT = 100;
/**
 * JSONCache eases the difficulties in storing a JSON in redis.
 *
 *  It stores the JSON in hashset for simpler get and set of required
 * fields. It also allows you to override/set specific fields in
 * the JSON without rewriting the whole JSON tree. Which means that it
 * is literally possible to `Object.deepAssign()`.
 *
 *   Everytime you store an object, JSONCache would store two hashset
 * in Redis, one for data and the other for type information. This helps
 * during retrieval of data, to restore the type of data which was originally
 * provided. All these workaround are needed because Redis DOES NOT support
 * any other data type apart from String.
 *
 * Well the easiest way is to store an object in Redis is
 * JSON.stringify(obj) and store the stringified result.
 * But this can cause issue when the obj is
 * too huge or when you would want to retrieve only specific fields
 * from the JSON but do not want to parse the whole JSON.
 *   Also note that this method would end up in returing all the
 * fields as strings and you would have no clue to identify the type of
 * field.
 */
class JSONCache {
    /**
     * Intializes JSONCache instance
     * @param redisClient RedisClient instance(Preferred ioredis - cient).
     *      It support any redisClient instance that has
     *      `'hmset' | 'hmget' | 'hgetall' | 'expire' | 'del' | 'keys'`
     *      methods implemented
     * @param options Options for controlling the prefix
     */
    constructor(redisClient, options = {}) {
        this.options = options;
        this.options.prefix = options.prefix || 'jc:';
        this.redisClientInt = {
            hmset: util.promisify(redisClient.hmset).bind(redisClient),
            hmget: util.promisify(redisClient.hmget).bind(redisClient),
            hgetall: util.promisify(redisClient.hgetall).bind(redisClient),
            expire: util.promisify(redisClient.expire).bind(redisClient),
            del: util.promisify(redisClient.del).bind(redisClient),
            scan: util.promisify(redisClient.scan).bind(redisClient),
            multi: redisClient.multi.bind(redisClient),
        };
        this.flattener = new Flattener(options.stringifier, options.parser);
    }
    /**
     * Flattens the given json object and
     * stores it in Redis hashset
     *
     * @param key Redis key
     * @param obj JSON object to be stored
     * @param options
     */
    set(key, obj, options = {}) {
        return __awaiter(this, void 0, void 0, function* () {
            const flattened = this.flattener.flatten(obj);
            yield Promise.all([
                this.redisClientInt.hmset(this.getKey(key), flattened.data),
                this.redisClientInt.hmset(this.getTypeKey(key), flattened.typeInfo),
            ]);
            if (options.expire) {
                yield Promise.all([
                    this.redisClientInt.expire(this.getKey(key), options.expire),
                    this.redisClientInt.expire(this.getTypeKey(key), options.expire),
                ]);
            }
        });
    }
    /**
     * Retrieves the hashset from redis and
     * unflattens it back to the original Object
     *
     * @param key Redis key
     * @param fields List of fields to be retreived from redis.
     *    This helps reduce network latency incase only a few fields are
     *    needed.
     *
     * @returns request object from the cache
     */
    get(key, ...fields) {
        return __awaiter(this, void 0, void 0, function* () {
            const [data, typeInfo] = yield Promise.all([
                this.redisClientInt.hgetall(this.getKey(key)),
                this.redisClientInt.hgetall(this.getTypeKey(key)),
            ]);
            // Empty object is returned when
            // the given key is not present
            // in the cache
            if (!data || Object.keys(data).length === 0) {
                return undefined;
            }
            let result;
            if (fields.length > 0) {
                let dataKeys;
                result = fields.reduce((res, field) => {
                    if (field in data) {
                        res.data[field] = data[field];
                        res.typeInfo[field] = typeInfo[field];
                    }
                    else {
                        const searchKey = `${field}.`;
                        (dataKeys || (dataKeys = Object.keys(data))).forEach(flattenedKey => {
                            if (flattenedKey.startsWith(searchKey)) {
                                res.data[flattenedKey] = data[flattenedKey];
                                res.typeInfo[flattenedKey] = typeInfo[flattenedKey];
                            }
                        });
                    }
                    return res;
                }, { data: {}, typeInfo: {} });
            }
            else {
                result = { data, typeInfo };
            }
            return this.flattener.unflatten(result);
        });
    }
    /**
     * Removes/deletes the entire hashset for the given
     * key in the JSON Cache.
     *
     * @param key Redis key
     */
    del(key) {
        return __awaiter(this, void 0, void 0, function* () {
            return yield Promise.all([
                this.redisClientInt.del(this.getKey(key)),
                this.redisClientInt.del(this.getTypeKey(key))
            ]);
        });
    }
    /**
     * Replace the entire hashset for the given key
     *
     * @param key Redis key
     * @param obj JSON Object of type T
     */
    rewrite(key, obj) {
        return __awaiter(this, void 0, void 0, function* () {
            yield this.redisClientInt.del(this.getKey(key));
            yield this.set(key, obj);
        });
    }
    /**
     * Removes/deletes all the keys in the JSON Cache,
     * having the prefix.
     */
    clearAll() {
        return __awaiter(this, void 0, void 0, function* () {
            let cursor = '0';
            let keys;
            do {
                [cursor, keys] = yield this.redisClientInt.scan(cursor, 'MATCH', `${this.options.prefix}*`, 'COUNT', SCAN_COUNT);
                if (keys.length > 0) {
                    yield this.redisClientInt.del(...keys);
                }
            } while (cursor !== '0');
        });
    }
    /******************
     * PRIVATE METHODS
     ******************/
    /**
     * Returns the redis storage key for storing data
     * by prefixing custom string, such that it
     * doesn't collide with other keys in usage
     *
     * @param key Storage key
     */
    getKey(key) {
        return `${this.options.prefix}${key}`;
    }
    /**
     * Returns the redis storage key for storing
     * corresponding types by prefixing custom string,
     * such that it doesn't collide with other keys
     * in usage
     *
     * @param key Storage key
     */
    getTypeKey(key) {
        return `${this.options.prefix}${key}_t`;
    }
}

module.exports = JSONCache;
