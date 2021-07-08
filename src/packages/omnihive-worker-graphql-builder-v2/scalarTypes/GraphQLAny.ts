import { GraphQLScalarType } from "graphql";
import { Kind } from "graphql/language";
import Json5 from "json5";

export default new GraphQLScalarType({
    name: "Any",
    description: "Graph equivalent of an any typescript type.",
    parseValue(value) {
        return value;
    },
    serialize(value) {
        return value.toString();
    },
    parseLiteral(ast) {
        switch (ast.kind) {
            case Kind.STRING:
                return ast.value.charAt(0) === "{" ? Json5.parse(ast.value) : ast.value;
            case Kind.OBJECT:
                return parseObject(ast);
        }
        return parseAst(ast);
    },
});

function parseObject(ast: any) {
    const value = Object.create(null);
    ast.fields.forEach((field: any) => {
        value[field.name.value] = parseAst(field.value);
    });
    return value;
}

function parseAst(ast: any) {
    switch (ast.kind) {
        case Kind.STRING:
        case Kind.BOOLEAN:
            return ast.value;
        case Kind.INT:
        case Kind.FLOAT:
            return parseFloat(ast.value);
        case Kind.OBJECT:
            return parseObject(ast);
        case Kind.LIST:
            return ast.values.map(parseAst);
        default:
            return ast.values;
    }
}
