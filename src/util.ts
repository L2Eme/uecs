
export type Constructor<T, Args extends any[] = any> = {
    new(...args: Args): T
}

export type InstanceTypeTuple<T extends any[]> = {
    [K in keyof T]: T[K] extends Constructor<infer U> ? U : never;
};