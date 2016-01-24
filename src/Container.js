import {
  addHiddenPropsToTarget,
  classCallCheck,
  extend,
  fillIn,
  forOwn,
  isObject,
  isString
} from './utils'
import {
  belongsToType,
  hasManyType,
  hasOneType
} from './decorators'
import Mapper from './Mapper'

/**
 * The `Container` class is a place to store mappers.
 *
 * ```javascript
 * import {Container} from 'js-data'
 * ```
 *
 * Without a container, you need to manage mappers yourself, including resolving
 * circular dependencies among relations. All mappers in a container share the
 * same adapters, so you don't have to add each adapter to all of your mappers.
 *
 * Without `Container:
 *
 * ```javascript
 * import {Mapper} from 'js-data'
 * import HttpAdapter from 'js-data-http'
 * const adapter = new HttpAdapter()
 * const userMapper = new Mapper({ name: 'user' })
 * userMapper.registerAdapter('http', adapter, { default: true })
 * const commentMapper = new Mapper({ name: 'comment' })
 * commentMapper.registerAdapter('http', adapter, { default: true })
 *
 * // This would be more difficult if the mappers were defined in different
 * // modules.
 * userMapper.hasMany(commentMapper, {
 *   localField: 'comments',
 *   foreignKey: 'userId'
 * })
 * commentMapper.belongsTo(userMapper, {
 *   localField: 'user',
 *   foreignKey: 'userId'
 * })
 * ```
 *
 * With `Container`:
 *
 * ```javascript
 * import {Container} from 'js-data'
 * import HttpAdapter from 'js-data-http'
 * const container = new Container()
 * // All mappers in container share adapters
 * container.registerAdapter('http', new HttpAdapter(), { default: true })
 *
 * // These could be defined in separate modules without a problem.
 * const userMapper = container.defineMapper('user', {
 *   relations: {
 *     hasMany: {
 *       comment: {
 *         localField: 'comments',
 *         foreignKey: 'userId'
 *       }
 *     }
 *   }
 * })
 * const commentMapper = container.defineMapper('comment', {
 *   relations: {
 *     belongsTo: {
 *       user: {
 *         localField: 'user',
 *         foreignKey: 'userId'
 *       }
 *     }
 *   }
 * })
 * ```
 *
 * @class Container
 * @param {Object} [opts] Configuration options.
 * @param {Function [opts.MapperClass] Constructor function to use in
 * {@link Container#defineMapper} to create a new mapper.
 * @param {Object} [opts.mapperDefaults] Defaults options to pass to
 * {@link Container#MapperClass} when creating a new mapper.
 * @return {Container}
 */
export default function Container (opts) {
  const self = this
  classCallCheck(self, Container)

  opts || (opts = {})
  // Apply options provided by the user
  fillIn(self, opts)
  // Default mapper options
  self.mapperDefaults = self.mapperDefaults || {}
  // Default MapperClass
  self.MapperClass = self.MapperClass || Mapper

  // Initilize private data

  // Holds the adapters, shared by all mappers in this container
  self._adapters = {}
  // The the mappers in this container
  self._mappers = {}
}

/**
 * Create a Container subclass.
 *
 * ```javascript
 * var MyContainer = Container.extend({
 *   foo: function () { return 'bar' }
 * })
 * var container = new MyContainer()
 * container.foo() // "bar"
 * ```
 *
 * @name Container.extend
 * @method
 * @param {Object} [props={}] Properties to add to the prototype of the
 * subclass.
 * @param {Object} [classProps={}] Static properties to add to the subclass.
 * @return {Function} Subclass of Container.
 */
Container.extend = extend

addHiddenPropsToTarget(Container.prototype, {
  /**
   * Create a new mapper and register it in this container.
   *
   * ```javascript
   * import {Container} from 'js-data'
   * const container = new Container({
   *   mapperDefaults: { foo: 'bar' }
   * })
   * const userMapper = container.defineMapper('user')
   * userMapper.foo // "bar"
   *
   * @name Container#defineMapper
   * @method
   * @param {string} name Name under which to register the new {@link Mapper}.
   * {@link Mapper#name} will be set to this value.
   * @param {Object} [opts] Configuration options. Passed to
   * {@link Container#MapperClass} when creating the new {@link Mapper}.
   * @return {Mapper}
   */
  defineMapper (name, opts) {
    const self = this

    // For backwards compatibility with defineResource
    if (isObject(name)) {
      opts = name
      if (!opts.name) {
        throw new Error('name is required!')
      }
      name = opts.name
    } else if (!isString(name)) {
      throw new Error('name is required!')
    }

    // Default values for arguments
    opts || (opts = {})
    // Set Mapper#name
    opts.name = name
    opts.relations || (opts.relations = {})

    // Check if the user is overriding the datastore's default MapperClass
    const MapperClass = opts.MapperClass || self.MapperClass
    delete opts.MapperClass

    // Apply the datastore's defaults to the options going into the mapper
    fillIn(opts, self.mapperDefaults)

    // Instantiate a mapper
    const mapper = self._mappers[name] = new MapperClass(opts)
    // Make sure the mapper's name is set
    mapper.name = name
    // All mappers in this datastore will share adapters
    mapper._adapters = self.getAdapters()

    // Setup the mapper's relations, including generating Mapper#relationList
    // and Mapper#relationFields
    forOwn(mapper.relations, function (group, type) {
      forOwn(group, function (relations, _name) {
        if (isObject(relations)) {
          relations = [relations]
        }
        relations.forEach(function (def) {
          def.getRelation = function () {
            return self.getMapper(_name)
          }
          const Relation = self._mappers[_name] || _name
          if (type === belongsToType) {
            mapper.belongsTo(Relation, def)
          } else if (type === hasOneType) {
            mapper.hasOne(Relation, def)
          } else if (type === hasManyType) {
            mapper.hasMany(Relation, def)
          }
        })
      })
    })

    return mapper
  },

  /**
   * Return the name of a registered adapter based on the given name or options,
   * or the name of the default adapter if no name provided.
   *
   * @name Container#getAdapterName
   * @method
   * @param {(Object|string)} [opts] The name of an adapter or options, if any.
   * @return {string} The name of the adapter.
   */
  getAdapterName (opts) {
    opts || (opts = {})
    if (isString(opts)) {
      opts = { adapter: opts }
    }
    return opts.adapter || this.mapperDefaults.defaultAdapter
  },

  /**
   * Return the registered adapter with the given name or the default adapter if
   * no name is provided.
   *
   * @name Container#getAdapter
   * @method
   * @param {string} [name] The name of the adapter to retrieve.
   * @return {Adapter} The adapter.
   */
  getAdapter (name) {
    const self = this
    const adapter = self.getAdapterName(name)
    if (!adapter) {
      throw new ReferenceError(`${adapter} not found!`)
    }
    return self.getAdapters()[adapter]
  },

  /**
   * Return the registered adapters of this container.
   *
   * @name Container#getAdapters
   * @method
   * @return {Adapter}
   */
  getAdapters () {
    return this._adapters
  },

  /**
   * Return the mapper registered under the specified name.
   *
   * ```javascript
   * import {Container} from 'js-data'
   * const container = new Container()
   * const userMapper = container.defineMapper('user')
   * userMapper === container.getMapper('user') // true
   * ```
   *
   * @name Container#getMapper
   * @method
   * @param {string} name {@link Mapper#name}.
   * @return {Mapper}
   */
  getMapper (name) {
    const mapper = this._mappers[name]
    if (!mapper) {
      throw new ReferenceError(`${name} is not a registered mapper!`)
    }
    return mapper
  },

  /**
   * Register an adapter on this container under the given name. Adapters
   * registered on a container are shared by all mappers in the container.
   *
   * ```javascript
   * import {Container} from 'js-data'
   * import HttpAdapter from 'js-data-http'
   * const container = new Container()
   * container.registerAdapter('http', new HttpAdapter, { default: true })
   * ```
   *
   * @name Container#registerAdapter
   * @method
   * @param {string} name The name of the adapter to register.
   * @param {Adapter} adapter The adapter to register.
   * @param {Object} [opts] Configuration options.
   * @param {boolean} [opts.default=false] Whether to make the adapter the
   * default adapter for all Mappers in this container.
   */
  registerAdapter (name, adapter, opts) {
    const self = this
    self.getAdapters()[name] = adapter
    // Optionally make it the default adapter for the target.
    if (opts === true || opts.default) {
      forOwn(self._mappers, function (mapper) {
        mapper.defaultAdapter = name
      })
    }
  }
})
