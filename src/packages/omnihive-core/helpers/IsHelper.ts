export class IsHelper {
    public static isArray = <T = any>(value: unknown): value is T[] => {
        return Array.isArray(value);
    };

    public static isBoolean = (value: unknown): value is boolean => {
        return (
            (typeof value === "boolean" && (value === true || value === false)) ||
            (typeof value === "string" && (value === "true" || value === "false"))
        );
    };

    public static isDate = (value: unknown): value is Date => {
        return Object.prototype.toString.call(value) === "[object Date]";
    };

    public static isEmptyArray = (value: unknown): boolean => {
        return IsHelper.isArray(value) && value.length === 0;
    };

    public static isEmptyObject = (value: unknown): boolean => {
        return IsHelper.isObject(value) && Object.keys(value).length === 0;
    };

    public static isEmptyString = (value: unknown): boolean => {
        try {
            return IsHelper.isString(value) && String(value).length === 0;
        } catch {
            return false;
        }
    };

    public static isEmptyStringOrWhitespace = (value: unknown): boolean => {
        return IsHelper.isEmptyString(value) || IsHelper.isWhiteSpaceString(value);
    };

    public static isFunction = (value: unknown): value is Function => {
        return typeof value === "function";
    };

    public static isIpv4 = (value: unknown): boolean => {
        if (typeof value !== "string") {
            return false;
        }

        const regex: RegExp =
            /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/g;

        return regex.test(value);
    };

    public static isNull = (value: unknown): value is null => {
        return value === null;
    };

    public static isNumber = (value: unknown): value is number => {
        if (typeof value === "number") {
            return true;
        }

        if (typeof value !== "string") {
            return false;
        }

        if (IsHelper.isEmptyStringOrWhitespace(value)) {
            return false;
        }

        const regex: RegExp = /^[0-9]*$/g;

        return regex.test(String(value));
    };

    public static isNullOrUndefined = (value: unknown): value is null | undefined => {
        return IsHelper.isNull(value) || IsHelper.isUndefined(value);
    };

    public static isNullOrUndefinedOrEmptyStringOrWhitespace = (value: unknown): value is null | undefined | "" => {
        return IsHelper.isNullOrUndefined(value) || IsHelper.isEmptyStringOrWhitespace(value);
    };

    public static isObject = (value: unknown): value is object => {
        return !IsHelper.isNull(value) && (typeof value === "object" || IsHelper.isFunction(value));
    };

    public static isPlainObject = <T = unknown>(value: unknown): value is Record<string | number | symbol, T> => {
        if (toString.call(value) !== "[object Object]") {
            return false;
        }

        const prototype = Object.getPrototypeOf(value);
        return prototype === null || prototype === Object.getPrototypeOf({});
    };

    public static isString = (value: unknown): value is string => {
        return typeof value === "string";
    };

    public static isTruthy = (value: unknown): boolean => {
        return Boolean(value);
    };

    public static isUndefined = (value: unknown): value is undefined => {
        return typeof value === "undefined" || value === undefined;
    };

    public static isWhiteSpaceString = (value: unknown): value is string => {
        try {
            return IsHelper.isString(value) && !/\S/.test(String(value));
        } catch {
            return false;
        }
    };
}
