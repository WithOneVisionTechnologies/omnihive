import { GraphQLScalarType } from "graphql";
import { Kind } from "graphql/language";
import { IsHelper } from "../helpers/IsHelper";

function identity(value: any) {
    return value;
}

function ensureObject(value: any) {
    if (IsHelper.isNullOrUndefined(value) || !IsHelper.isObject(value)) {
        throw new Error(`JSONObject cannot represent non-object value: ${value}`);
    }

    return value;
}

function parseObject(ast: any, variables: any) {
    const value = Object.create(null);

    if (IsHelper.isArray(ast)) {
        ast.forEach((element) => {
            value[element.name] = parseObject(element, variables);
        });
    } else {
        ast.fields.forEach((field: { name: { value: string | number }; value: any }) => {
            // eslint-disable-next-line no-use-before-define
            value[field.name.value] = parseLiteral(field.value, variables);
        });
    }

    return value;
}

function parseLiteral(ast: any, variables: any) {
    switch (ast.kind) {
        case Kind.STRING:
        case Kind.BOOLEAN:
            return ast.value;
        case Kind.INT:
        case Kind.FLOAT:
            return parseFloat(ast.value);
        case Kind.OBJECT:
            return parseObject(ast, variables);
        case Kind.LIST:
            return ast.values.map((n: any) => parseLiteral(n, variables));
        case Kind.NULL:
            return null;
        case Kind.VARIABLE: {
            const name = ast.name.value;
            return variables ? variables[name] : undefined;
        }
        default:
            return undefined;
    }
}

// This named export is intended for users of CommonJS. Users of ES modules
// should instead use the default export.
export const GraphQLJSON = new GraphQLScalarType({
    description:
        "The `JSON` scalar type represents JSON values as specified by [ECMA-404](http://www.ecma-international.org/publications/files/ECMA-ST/ECMA-404.pdf).",
    name: "JSON",
    parseLiteral,
    parseValue: identity,
    serialize: identity,
});

export const GraphQLJSONObject = new GraphQLScalarType({
    description:
        "The `JSONObject` scalar type represents JSON objects as specified by [ECMA-404](http://www.ecma-international.org/publications/files/ECMA-ST/ECMA-404.pdf).",
    name: "JSONObject",
    parseLiteral: parseObject,
    parseValue: ensureObject,
    serialize: ensureObject,
});
