
import { World, Tag } from "./index";

class A { a = 0 }
class B { b = 0 }
class C { c = 0 }

// things that are tested implicitly:
//  - world.size()
//  - world.has()
//  - world.exists()
//  - world.emplace()
//  - world.remove()

describe("behavior", function () {
    it("creates empty entity", function () {
        const world = new World;

        world.create();
        expect(world.size()).toEqual(1);
    });

    it("creates entity with components", function () {
        const world = new World;

        const entity = world.create(new A, new B);
        expect(world.has(entity, A) && world.has(entity, B)).toBeTruthy();
    });

    it("creates entity with tags", function () {
        const world = new World;

        const entity = world.create(Tag.for("Test"));
        expect(world.has(entity, Tag.for("Test"))).toBeTruthy();
        expect(world.has(entity, Tag.for("NotTest"))).toBeFalsy();
    });

    it("creates entity with enum tags", function () {
        enum TagId { A, B }
        const world = new World;

        const entity = world.create(Tag.for(TagId.A));
        expect(world.has(entity, Tag.for(TagId.A))).toBeTruthy();
        expect(world.has(entity, Tag.for(TagId.B))).toBeFalsy();
    });

    it("creates entity with object tags", function () {
        const TagA = { toString() { return "A" } };
        const TagB = { toString() { return "B" } };
        const world = new World;

        const entity = world.create(Tag.for(TagA));
        expect(world.has(entity, Tag.for(TagA))).toBeTruthy();
        expect(world.has(entity, Tag.for(TagB))).toBeFalsy();
    });

    it("inserts empty entity", function () {
        const world = new World;

        const entity = 10;
        world.insert(10);
        expect(world.exists(entity));
        expect(world.size()).toEqual(1);
    });

    it("inserts entity with components", function () {
        const world = new World;

        const entity = world.insert(10, new A);
        expect(world.exists(entity));
        expect(world.size()).toEqual(1);
        expect(world.has(entity, A)).toBeTruthy();
    });

    it("inserts entity with tags", function () {
        const world = new World;

        const entity = world.insert(10, Tag.for("Test"));
        expect(world.exists(entity));
        expect(world.size()).toEqual(1);
        expect(world.has(entity, Tag.for("Test"))).toBeTruthy();
    });

    it("inserts entity with components", function () {
        const world = new World;

        const entity = world.insert(10, new A);
        expect(world.exists(entity));
        expect(world.size()).toEqual(1);
        expect(world.has(entity, A)).toBeTruthy();
    });

    it("removes tag", function () {
        const world = new World;
        const entity = world.create(Tag.for("A"));
        expect(world.has(entity, Tag.for("A"))).toBeTruthy();
        expect(world.remove(entity, Tag.for("A"))).not.toBeUndefined();
        expect(world.has(entity, Tag.for("A"))).toBeFalsy();
    });

    it("remove doesn't throw for dead entity", function () {
        const world = new World;

        const thing = world.remove(0, A);
        expect(thing).toBeUndefined();
    });

    it("destroys entity without free", function () {
        const world = new World;

        const entity = world.create(new A);
        expect(world.size()).toEqual(1);
        world.destroy(entity);
        expect(world.size()).toEqual(0);
    });

    it("destroys entity without free", function () {
        const world = new World;

        const freeFn = jest.fn();
        class Freeable { free = freeFn }

        const entity = world.create(new Freeable);
        expect(world.size()).toEqual(1);
        world.destroy(entity);
        // expect(freeFn).toBeCalled();
        expect(world.size()).toEqual(0);
    });

    it("gets assigned component", function () {
        const world = new World;

        const entity = world.create(new A);
        expect(world.get(entity, A)).not.toBeUndefined();
    });

    it("gets resource component", function () {
        const world = new World;
        class Res { a: number = 0 }

        world.create(new Res);
        let res = world.getResource(Res)
        res.a = 1
        expect(res).toBe(world.getResource(Res))
        expect(world.getResource(Res).a).toBe(1)
    });

    it("returns a non-empty view", function () {
        const world = new World;

        let expectedCount = 0;
        for (let i = 0; i < 100; ++i) {
            const entity = world.create(new A, new B);
            if (i % 3 === 0) {
                world.emplace(entity, new C);
                expectedCount++;
            }
        }

        let actualCount = 0;
        world.view(A, C).each(() => {
            actualCount++;
        });

        expect(actualCount).toEqual(expectedCount);
    });

    it("clears the world", function () {
        const world = new World;
        for (let i = 0; i < 100; ++i) {
            world.create();
        }
        expect(world.size()).toEqual(100);
        world.clear();
        expect(world.size()).toEqual(0);
    });

    it("returns all entities", function () {
        const world = new World;
        for (let i = 0; i < 100; ++i) {
            world.create();
        }

        let count = 0;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for (const _ of world.allSlotIndexes()) {
            count++;
        }

        expect(count).toEqual(world.size());
    });

    it("view doesn't throw on unknown components", function () {
        class A { }
        const world = new World;
        for (let i = 0; i < 100; ++i) {
            world.create();
        }

        expect(() => world.view(A).each(() => { })).not.toThrow();
    });

    it("insert may use empty slot", function () {
        const world = new World;

        let id = world.insert(100);
        expect(id).toEqual(0)
        expect(world.create()).toEqual(1 << 8);

        let id0 = world.insert(99);
        expect(id0).toEqual(2 << 8)
        expect(world.create()).toEqual(3 << 8);

        expect(world.exists(0 << 8)).toBe(true);
        expect(world.exists(1 << 8)).toBe(true);
        expect(world.exists(2 << 8)).toBe(true);

        world.destroy(0 << 8);
        world.destroy(1 << 8);
        world.destroy(2 << 8)

        expect(world.exists(0 << 8)).toBe(false);
        expect(world.exists(1 << 8)).toBe(false);
        expect(world.exists(2 << 8)).toBe(false);

        expect(world.insert(1)).toBe(4 << 8);
        expect(world.create()).toBe(5 << 8);
        expect(world.create()).toBe(6 << 8);

    });

    it("insert does not break sequence", function () {
        const world = new World;

        const _ = world.insert(0);
        const b = world.create(); // should be 1

        expect(b).toEqual(1 << 8);
    });

    it("insert new generation", function () {
        const world = new World;

        for (let i = 0; i < 1024; i ++) {
            world.create();
        }

        for (let i = 0; i < 512; i ++) {
            world.destroy(i << 8)
        }

        let id0_gen1 = world.create()
        let id1_gen1 = world.create()
        expect(id0_gen1).toBe((0 << 8) + 1)
        expect(id1_gen1).toBe((1 << 8) + 1)
    });

    it("world create many entities", function () {
        const world = new World;

        for (let i = 0; i < 2048; i ++) {
            let e = world.create();
            world.emplace(e, new A)
            world.destroy(e)
        }

        let e = world.create()
        world.emplace(e, new A)
    });

    it("view loop infinitely", function () {
        const world = new World;
        world.create(A);
        let count = 0;
        // creates 1 new entities
        world.view(A).each((e) => {
            // base case
            if (e > 5) return false;
            count ++;
            world.create(A);
        });
        expect(count).toEqual(1);
        expect(world.size()).toEqual(2);

        // creates 2 new entities
        world.view(A).each((e) => {
            // base case
            if (e > 5) return false;
            count ++;
            world.create(A);
        });
        expect(count).toEqual(3);
        expect(world.size()).toEqual(4);
    });
});

describe("examples", function () {
    it(".insert example", function () {
        class A { constructor(public value = 0) { } }
        class B { constructor(public value = 0) { } }
        const world = new World;
        const entity = world.create(new A, new B);
        expect(world.get(entity, A)).toEqual(new A);
        world.insert(entity, new A(5));
        expect(world.get(entity, A)).toEqual(new A(5));
        expect(world.get(entity, B)).toEqual(new B);
    });

    it(".destroy example", function () {
        const free = jest.fn();
        class A { free = free }
        const world = new World();
        const entity = world.create(new A);
        world.destroy(entity);
        // expect(free).toBeCalled();
    });

    it(".get example", function () {
        class A { value = 50 }
        class B { }
        const world = new World();
        const entity = world.create();
        world.emplace(entity, new A);
        expect(world.get(entity, A)?.value).toEqual(50);
        expect(() => world.get(entity, A)!.value = 10).not.toThrow();
        expect(world.get(entity, A)?.value).toEqual(10);
        expect(world.get(entity, B)).toBeUndefined();
        expect(world.get(100, A)).toBeUndefined();
    });

    it(".has example", function () {
        class A { }
        const world = new World();
        const entity = world.create();
        expect(world.has(entity, A)).toBeFalsy();
        world.emplace(entity, new A);
        expect(world.has(entity, A)).toBeTruthy();
        expect(world.has(100, A)).toBeFalsy();
    });

    it(".emplace example 1", function () {
        class A { constructor(public value = 0) { } }
        const world = new World();
        const entity = world.create();
        world.emplace(entity, new A(0));
        world.emplace(entity, new A(5));
        expect(world.get(entity, A)).toEqual(new A(5));
    });

    it(".emplace example 2", function () {
        class A { constructor(public value = 0) { } }
        const world = new World;
        expect(world.exists(0)).toBeFalsy();
        expect(() => world.emplace(0, new A)).toThrowError(new Error(
            `Cannot set component "${A.name}" for dead entity ID 0`
        ));
    });

    it(".remove example", function () {
        class A { constructor(public value = 10) { } }
        const world = new World();
        const entity = world.create();
        world.emplace(entity, new A);
        expect(() => world.get(entity, A)!.value = 50).not.toThrow();
        expect(world.remove(entity, A)).toEqual(new A(50));
        expect(world.remove(entity, A)).toBeUndefined();
    });

    it(".view example", function () {
        class Fizz { }
        class Buzz { }
        const world = new World();
        for (let i = 0; i < 30; ++i) {
            const entity = world.create();
            if (i % 3 === 0) world.emplace(entity, new Fizz);
            if (i % 5 === 0) world.emplace(entity, new Buzz);
        }

        const result: number[] = [];
        world.view(Fizz, Buzz).each((n) => {
            result.push(n);
        });
        expect(result).toEqual([0, 15])
    });

    it(".view example return false", function () {
        class Test { constructor(public value: number) { } }
        const world = new World;
        for (let i = 0; i < 100; ++i) world.create(new Test(i));
        let count = 0;
        world.view(Test).each((entity, test) => {
            if (test.value === 50) {
                return false;
            }
            count += 1;
        });
        expect(count).toEqual(50);
    });

});