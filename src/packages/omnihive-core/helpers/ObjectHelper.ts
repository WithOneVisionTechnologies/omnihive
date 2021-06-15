import { IsHelper } from "./IsHelper";

export class ObjectHelper {
    public static create = <T extends unknown>(type: { new (): T }, model: any | null): T => {
        const generic: T = new type();

        if (IsHelper.isNullOrUndefined(model)) {
            return generic;
        }

        Object.keys(model).forEach((key: string) => {
            // @ts-ignore
            if (key in generic) {
                (generic as any)[key] = model[key];
            }
        });

        return generic;
    };

    public static createStrict = <T extends unknown>(type: { new (): T }, model: any | null): T => {
        const generic: T = new type();

        if (IsHelper.isNullOrUndefined(model)) {
            throw new Error(`Model cannot be null or undefined in strict mode.`);
        }

        Object.keys(model).forEach((key: string) => {
            // @ts-ignore
            if (key in generic) {
                (generic as any)[key] = model[key];
            } else {
                throw new Error(`Property ${key} does not exist on target generic type.`);
            }
        });

        return generic;
    };

    public static createArray = <T extends unknown>(type: { new (): T }, array: any[]): T[] => {
        const genericArray: T[] = [];

        array.forEach((arrayItem: any) => {
            genericArray.push(ObjectHelper.create(type, arrayItem));
        });

        return genericArray;
    };

    public static createArrayStrict = <T extends unknown>(type: { new (): T }, array: any[]): T[] => {
        const genericArray: T[] = [];

        array.forEach((arrayItem: any) => {
            genericArray.push(ObjectHelper.createStrict(type, arrayItem));
        });

        return genericArray;
    };
}
