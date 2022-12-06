import { InstanceTypeTuple, Constructor } from "./util";

/**
 * An opaque identifier used to access component arrays
 */
export type Entity = number;

/**
 * The Null entity can be used to initialiaze a variable
 * which is meant to hold an entity without actually using `null`.
 */
export const Null: Entity = -1;

/**
 * Stores arbitrary data
 */
export interface Component {
    free?: () => void;
    [x: string]: any;
    [x: number]: any;
}

/**
 * Fast Array <--> Slow Array
 * * 使用slot index，而不是entity作为索引
 */
export type ComponentStorage<T> = T[]
// Type aliases for component storage
interface TypeStorage<T> { [type: string]: ComponentStorage<T> }

// class ComponentSlots<T> {
//     slots: (number | undefined)[] = []
//     storage: (T | undefined)[] = []
//     getSlotIndexes(): number[] {
//         return this.slots.filter(v => v !== undefined) as any
//     }
// }

// store entities in Array<Entity> instead of Set<Entity>
// if an entity is destroyed, set it in the array to undefined
// skip entities marked as undefined in views
class IdSlots {

    slots: (number | undefined)[] = []
    generations: (number | undefined)[] = []
    deletedIds: number[] = []

    isDirty: boolean = true;
    cachedIds: number[] = []

    get size() {
        return this.slots.length - this.deletedIds.length
    }

    clear() {
        this.slots = []
        this.generations = []
        this.deletedIds = []
        this.isDirty = true
    }

    has(index: number, gen: number): boolean {
        return this.slots[index] !== undefined
            && (this.generations[index]! & 255) == gen
    }

    add(): Entity {
        this.isDirty = true;
        if (this.slots.length < 1024
            || (this.deletedIds.length * 4) < this.slots.length
            // || this.deletedIds.length === 0
        ) {
            // 如果slots总数少于1024，则一定新创建
            // 如果删除的数量小于slot的1/4，则一定新创建
            let index = this.slots.length;
            this.slots.push(index);
            this.generations[index] = 0;
            return index << 8
        } else {
            // 如果删除的数量大于1/4，则重用，并且增加一代
            let index: number;
            index = this.deletedIds.shift()!;
            this.slots[index] = index;
            let gen = this.generations[index]! + 1;
            this.generations[index] = gen;
            return (index << 8) + gen
        }
    }

    delete(slotIndex: number, gen: number): boolean {
        if (this.slots[slotIndex] !== undefined
            && (this.generations[slotIndex]! & 255) == gen) {
            this.isDirty = true;
            this.slots[slotIndex] = undefined;
            this.deletedIds.push(slotIndex)
            return true
        } else {
            return false
        }
    }

    getCachedSlotIndex(): number[] {
        if (this.isDirty) {
            this.isDirty = false;
            this.cachedIds = this.slots.filter(s => s !== undefined) as any
        }
        return this.cachedIds;
    }
}

/**
 * World is the core of the ECS. 
 * It stores all entities and their components, and enables efficiently querying them.
 * 
 * Visit https://jprochazk.github.io/uecs/ for a comprehensive tutorial.
 * 
 * TODO: add archetype
 */
export class World {
    private entities: IdSlots = new IdSlots;
    private components: TypeStorage<Component> = {};
    private views: { [id: string]: View<any> } = {};
    private resources: { [id: string]: Component } = {};

    /**
     * Creates an entity, and optionally assigns all `components` to it.
     */
    create<T extends Component[]>(...components: T): Entity {
        const entity = this.entities.add();

        // emplace all components into entity
        for (let i = 0, len = components.length; i < len; ++i) {
            this.emplace(entity, components[i]);
        }

        return entity
    }

    getEntity(slotIndex: number | string): Entity | undefined {
        let gen = this.entities.generations[slotIndex as any];
        if (gen !== undefined) {
            return ((slotIndex as any) << 8) + gen
        } else {
            return undefined
        }
    }

    /**
     * Inserts the `entity`, and optionally assigns all `components` to it.
     * 
     * If the entity already exists, all `components` will be assigned to it.
     * If it already has some other components, they won't be destroyed:
     * ```ts
     *  class A { constructor(value = 0) { this.value = value } }
     *  class B { constructor(value = 0) { this.value = value } }
     *  const world = new World;
     *  const entity = world.create(new A, new B);
     *  world.get(entity, A); // A { value: 0 }
     *  world.insert(entity, new A(5));
     *  world.get(entity, A); // A { value: 5 }
     *  world.get(entity, B); // B { value: 0 }
     * ```
     * 
     * You can first check if the entity exists, destroy it if so, and then insert it.
     * ```ts
     *  if (world.exists(entity)) {
     *      world.destroy(entity);
     *  }
     *  world.insert(entity, new A, new B, ...);
     * ```
     */
    insert<T extends Component[]>(entity: Entity, ...components: T): Entity {
        if (!this.exists(entity)) {
            entity = this.create()
        }
        for (let i = 0, len = components.length; i < len; ++i) {
            this.emplace(entity, components[i]);
        }
        return entity;
    }

    /**
     * Returns true if `entity` exists in this World
     */
    exists(entity: Entity): boolean {
        let slotIndex = entity >> 8;
        let generation = entity & 255;
        return this.entities.has(slotIndex, generation);
    }

    /**
     * Destroys an entity and all its components
     * 
     * Calls `.free()` (if available) on each destroyed component
     * 
     * Example:
     * ```
     *  class A { free() { console.log("A freed"); } }
     *  const world = new World();
     *  const entity = world.create(new A);
     *  world.destroy(entity); // logs "A freed"
     * ```
     */
    destroy(entity: Entity) {
        let slotIndex = entity >> 8;
        if (this.entities.delete(slotIndex, entity & 255)) {
            for (let key in this.components) {
                const storage = this.components[key];
                // const component = storage[slotIndex];
                // if (component !== undefined && component.free !== undefined) component.free();
                delete storage[slotIndex];
            }
        }
    }


    /**
     * Retrieves `component` belonging to `entity`. Returns `undefined`
     * if it the entity doesn't have `component`, or the `entity` doesn't exist.
     * 
     * Example:
     * ```
     *  class A { value = 50 }
     *  class B {}
     *  const world = new World();
     *  const entity = world.create();
     *  world.emplace(entity, new A);
     *  world.get(entity, A).value; // 50
     *  world.get(entity, A).value = 10;
     *  world.get(entity, A).value; // 10
     *  world.get(entity, B); // undefined
     *  world.get(100, A); // undefined
     * ```
     */
    get<T extends Component>(entity: Entity, component: Constructor<T>): T | undefined {
        if (this.exists(entity)) {
            let slotIndex = entity >> 8;
            const type = component.name;
            const storage = this.components[type];
            if (storage === undefined) return undefined;
            return storage[slotIndex] as T | undefined;
        } else {
            return undefined;
        }
    }

    /**
     * Returns `true` if `entity` exists AND has `component`, false otherwise.
     * 
     * Example:
     * ```
     *  class A {}
     *  const world = new World();
     *  const entity = world.create();
     *  world.has(entity, A); // false
     *  world.emplace(entity, new A);
     *  world.has(entity, A); // true
     *  world.has(100, A); // false
     * ```
     */
    has<T extends Component>(entity: Entity, component: Constructor<T>): boolean {
        if (this.exists(entity)) {
            let slotIndex = entity >> 8;
            const type = component.name;
            const storage = this.components[type];
            return storage !== undefined && storage[slotIndex] !== undefined;
        } else {
            return false
        }
    }

    /**
     * Sets `entity`'s instance of component `type` to `component`.
     * @throws If `entity` does not exist
     * 
     * 
     * Warning: Overwrites any existing instance of the component.
     * This is to avoid an unnecessary check in 99% of cases where the
     * entity does not have the component yet. Use `world.has` to 
     * check for the existence of the component first, if this is undesirable.
     * 
     * Example:
     * ```
     *  class A { constructor(value) { this.value = value } }
     *  const entity = world.create();
     *  world.emplace(entity, new A(0));
     *  world.emplace(entity, new A(5));
     *  world.get(entity, A); // A { value: 5 } -> overwritten
     * ```
     * 
     * Note: This is the only place in the API where an error will be
     * thrown in case you try to use a non-existent entity.
     * 
     * Here's an example of why it'd be awful if `World.emplace` *didn't* throw:
     * ```ts
     *  class A { constructor(value = 0) { this.value = value } }
     *  const world = new World;
     *  world.exists(0); // false
     *  world.emplace(0, new A);
     *  // entity '0' doesn't exist, but it now has a component.
     *  // let's try creating a brand new entity:
     *  const entity = world.create();
     *  // *BOOM!*
     *  world.get(0, A); // A { value: 0 }
     *  // it'd be extremely difficult to track down this bug.
     * ```
     */
    emplace<T extends Component>(entity: Entity, component: T) {
        const type = component.name ?? component.constructor.name;

        if (this.exists(entity)) {
            let slotIndex = entity >> 8;
            let storage = this.components[type];
            if (storage == null) {
                storage = this.components[type] = [];
            }
            storage[slotIndex] = component;
        } else {
            throw new Error(`Cannot set component "${type}" for dead entity ID ${entity}`);
        }
    }

    /**
     * Removes instance of `component` from `entity`, and returns the removed component.
     * Returns `undefined` if nothing was removed, or if `entity` does not exist.
     * 
     * Example:
     * ```
     *  class A { value = 10 }
     *  const world = new World();
     *  const entity = world.create();
     *  world.emplace(entity, new A);
     *  world.get(entity, A).value = 50
     *  world.remove(entity, A); // A { value: 50 }
     *  world.remove(entity, A); // undefined
     * ```
     * 
     * This does **not** call `.free()` on the component. The reason for this is that
     * you don't always want to free the removed component. Don't fret, you can still 
     * free component, because the `World.remove` call returns it! Example:
     * ```
     *  class F { free() { console.log("freed") } }
     *  const world = new World;
     *  const entity = world.create(new F);
     *  world.remove(entity, F).free();
     *  // you can use optional chaining to easily guard against the 'undefined' case:
     *  world.remove(entity, F)?.free();
     * ```
     */
    remove<T extends Component>(entity: Entity, component: Constructor<T>): T | undefined {
        if (this.exists(entity)) {
            let slotIndex = entity >> 8;
            const type = component.name;
            const storage = this.components[type];
            if (storage === undefined) return undefined;
            const out = storage[slotIndex] as T | undefined;
            delete storage[slotIndex];
            return out;
        } else {
            return undefined
        }
    }

    /**
     * Returns the size of the world (how many entities are stored)
     */
    size(): number {
        return this.entities.size;
    }

    /**
     * Used to query for entities with specific component combinations
     * and efficiently iterate over the result.
     * 
     * Example:
     * ```
     *  class Fizz { }
     *  class Buzz { }
     *  const world = new World();
     *  for (let i = 0; i < 100; ++i) {
     *      const entity = world.create();
     *      if (i % 3 === 0) world.emplace(entity, new Fizz);
     *      if (i % 5 === 0) world.emplace(entity, new Buzz);
     *  }
     * 
     *  world.view(Fizz, Buzz).each((n) => {
     *      console.log(`FizzBuzz! (${n})`);
     *  });
     * ```
     */
    view<T extends Constructor<Component>[]>(...types: T): View<T> {
        let id = "";
        for (let i = 0; i < types.length; ++i) {
            id += types[i].name;
        }
        if (!(id in this.views)) {
            let storages = types.map(t => this.getStorage(t))
            this.views[id] = new ViewImpl(this, storages);
        }
        return this.views[id];
    }

    /**
     * Removes every entity, and destroys all components.
     */
    clear() {
        this.entities.clear()
        this.components = {}
        this.resources = {}
    }

    /**
     * Returns an iterator over all the entities in the world.
     */
    allSlotIndexes(): number[] {
        return this.entities.getCachedSlotIndex()
    }

    /**
     * get storage
     */
    getStorage<T extends Component>(klass: Constructor<T>): ComponentStorage<T> {
        let name = klass.name;
        // ensure that never-before seen types are registered.
        if (this.components[name] === undefined) {
            this.components[name] = [];
        }
        return this.components[name] as any
    }

    /**
     * get resource
     */
    getResource<T extends Component>(klass: Constructor<T>): T {
        let name = klass.name;
        if (this.resources[name] === undefined) {
            let storage = this.getStorage(klass);
            if (storage.length === 0) {
                throw new Error("can't find the resource")
            }
            for (let c of storage) {
                this.resources[name] = c;
                break;
            }
        }
        return this.resources[name] as any
    }
}

/**
 * The callback passed into a `View`, generated by a world.
 * 
 * If this callback returns `false`, the iteration will halt.
 */
export type ViewCallback<T extends Constructor<Component>[]> = (entity: Entity, ...components: InstanceTypeTuple<T>) => false | void;

/**
 * A view is a non-owning entity iterator.
 * 
 * It is used to efficiently iterate over large batches of entities,
 * and their components.
 * 
 * A view is lazy, which means that it fetches entities and components 
 * just before they're passed into the callback.
 * 
 * The callback may return false, in which case the iteration will halt early.
 * 
 * This means you should avoid adding entities into the world, which have the same components
 * as the ones you're currently iterating over, unless you add a base case to your callback:
 * ```ts
 *  world.view(A, B, C).each((entity, a, b, c) => {
 *      // our arbitrary base case is reaching entity #1000
 *      // without this, the iteration would turn into an infinite loop.
 *      if (entity === 1000) return false;
 *      world.create(A, B, C);
 *  })
 * ```
 */
export interface View<T extends Constructor<Component>[]> {
    /**
     * Iterates over all the entities in the `View`.
     * 
     * If you return `false` from the callback, the iteration will halt.
     */
    each(callback: ViewCallback<T>): void;
}

type ComponentView<T extends Constructor<Component>[]> = (callback: ViewCallback<T>) => void;
class ViewImpl<T extends Constructor<Component>[]> {
    private view: ComponentView<T>;
    constructor(world: World, storages: ComponentStorage<Component>[]) {
        this.view = function (callback) {
            let entities = (world as any).entities.getCachedSlotIndex();
            for (let slot of entities) {
                let matchType = true;
                let params = [slot];
                for (let s of storages) {
                    let c = s[slot];
                    if (c === undefined) {
                        matchType = false;
                        break;
                    } else {
                        params.push(c)
                    }
                }

                if (matchType) {
                    // this apply is expensive
                    if (callback.apply(null, params as any) == false) return;
                } else {
                    continue;
                }
            }
        }
    }
    each(callback: ViewCallback<T>) {
        this.view(callback);
    }
}