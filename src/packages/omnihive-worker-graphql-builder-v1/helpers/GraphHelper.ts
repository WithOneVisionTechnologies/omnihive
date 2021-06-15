import _ from "lodash";
import { IsHelper } from "@withonevision/omnihive-core/helpers/IsHelper";

interface ITypeHandlers {
    [index: string]: ITypeHandler;
}

type ITypeHandler = (cellValue: any) => any;

interface IMetaValueProps {
    prop: string;
    column: string | string[];
    type?: string | ITypeHandler;
    default?: any;
}

interface IDictionary<TValue> {
    [index: string]: TValue;
}

interface IMetaColumnData {
    valueList: IMetaValueProps[];
    toOneList: IMetaValueProps[];
    arraysList: IMetaValueProps[];
    toManyPropList: string[];
    containingColumn: string[] | null;
    ownProp: string | null;
    isOneOfMany: boolean;
    cache: IDictionary<any>;
    containingIdUsage: IDictionary<IDictionary<boolean>> | null;
    defaults: IDictionary<string | null>;
}

interface IMetaData {
    primeIdColumnList: string[][];
    idMap: { [index: string]: IMetaColumnData };
}

interface IDefinitionColumn {
    column: string;
    id?: boolean;
    default?: any;
    type?: string;
    array?: boolean;
}

interface IDefinition {
    [index: string]: IDefinitionColumn | string | IDefinition | IDefinition[];
}

interface IData {
    [index: string]: any;
    [index: number]: any;
}

export class GraphHelper {
    private typeHandlers = {
        NUMBER(cellValue: any) {
            return parseFloat(cellValue);
        },
        BOOLEAN(cellValue: any) {
            return cellValue == true;
        },
    } as ITypeHandlers;

    private struct: object | any[] | null = null;

    /* Creates a data structure containing nested objects and/or arrays from
     * tabular data based on a structure definition provided by
     * structPropToColumnMap. If structPropToColumnMap is not provided but
     * the data has column names that follow a particular convention then a
     * nested structures can also be created.
     */
    public nestHydrate(data: any, structPropToColumnMap: IDefinition | IDefinition[] | null | boolean): any {
        let table;

        // VALIDATE PARAMS AND BASIC INITIALIZATION

        // Determines that on no results, and empty list is used instead of null. // NOTE: fact check this
        let listOnEmpty = false;

        if (IsHelper.isUndefined(structPropToColumnMap)) {
            structPropToColumnMap = null;
        }

        if (IsHelper.isNull(data)) {
            return null;
        }

        if (
            !IsHelper.isArray(structPropToColumnMap) &&
            !IsHelper.isPlainObject(structPropToColumnMap) &&
            !IsHelper.isNull(structPropToColumnMap) &&
            structPropToColumnMap !== true
        ) {
            throw new Error("nest expects param structPropToColumnMap to be an array, plain object, null, or true");
        }

        if (IsHelper.isPlainObject(data)) {
            // internal table should be a table format but a plain object
            // could be passed as the first (and only) row of that table
            table = [data];
        } else if (IsHelper.isArray(data)) {
            table = data;
        } else {
            throw Error(
                `nest expects param data to be in the form of a plain object or an array of plain objects (forming a table)`
            );
        }

        // structPropToColumnMap can be set to true as a tie break between
        // returning null (empty structure) or an empty list
        if (structPropToColumnMap === true) {
            listOnEmpty = true;
            structPropToColumnMap = null;
        }

        if (IsHelper.isNull(structPropToColumnMap) && !IsHelper.isEmptyArray(table)) {
            // property mapping not specified, determine it from column names
            structPropToColumnMap = this.structPropToColumnMapFromColumnHints(_.keys(table[0]));
        }

        if (IsHelper.isNull(structPropToColumnMap)) {
            // properties is empty, can't form structure or determine content
            // for a list. Assume a structure unless listOnEmpty
            return listOnEmpty ? [] : null;
        } else if (IsHelper.isEmptyArray(table)) {
            // table is empty, return the appropriate empty result based on input definition
            return IsHelper.isArray(structPropToColumnMap) ? [] : null;
        }

        // COMPLETE VALIDATING PARAMS AND BASIC INITIALIZATION

        const meta = this.buildMeta(structPropToColumnMap as IDefinition | IDefinition[]);

        // BUILD FROM TABLE

        // defines function that can be called recursively
        const recursiveNest = (row: IDictionary<any>, idColumns: string[]) => {
            // Obj is the actual object that will end up in the final structure
            let obj: IData;

            // Get all of the values for each id
            let vals: any[] = idColumns.map((column) => row[column]);

            // only really concerned with the meta data for this identity column
            const objMeta = meta.idMap[this.createCompositeKey(idColumns)];

            // If any of the values are null, we'll check and see if we need to set defaults
            vals = vals.map((value, idx) => {
                if (IsHelper.isNull(value)) {
                    if (!IsHelper.isNullOrUndefined(objMeta.defaults[idColumns[idx]])) {
                        return objMeta.defaults[idColumns[idx]];
                    }
                }
                return value;
            });

            if (vals.indexOf(null) !== -1) {
                return;
            }

            // check if object already exists in cache
            if (!IsHelper.isUndefined(objMeta.cache[this.createCompositeKey(vals)])) {
                // not already placed as to-many relation in container
                obj = objMeta.cache[this.createCompositeKey(vals)];

                // Add array values if necessary
                for (const prop of objMeta.arraysList) {
                    const cellValue = this.computeActualCellValue(prop, row[prop.column as string]);
                    if (IsHelper.isArray(obj[prop.prop])) {
                        obj[prop.prop].push(cellValue);
                    } else {
                        obj[prop.prop] = [cellValue];
                    }
                }

                if (IsHelper.isNull(objMeta.containingIdUsage)) {
                    return;
                }

                // We know for certain that containing column is set if
                // containingIdUsage is not null and can cast it as a string

                // check and see if this has already been linked to the parent,
                // and if so we don't need to continue
                const containingIds = (objMeta.containingColumn as string[]).map((column) => row[column]);
                if (
                    !IsHelper.isUndefined(objMeta.containingIdUsage[this.createCompositeKey(vals)]) &&
                    !IsHelper.isUndefined(
                        objMeta.containingIdUsage[this.createCompositeKey(vals)][this.createCompositeKey(containingIds)]
                    )
                ) {
                    return;
                }
            } else {
                // don't have an object defined for this yet, create it and set the cache
                obj = {};
                objMeta.cache[this.createCompositeKey(vals)] = obj;

                // copy in properties from table data
                for (const prop of objMeta.valueList) {
                    const cellValue = this.computeActualCellValue(prop, row[prop.column as string]);
                    obj[prop.prop] = cellValue;
                }

                // Add array values
                for (const prop of objMeta.arraysList) {
                    const cellValue = this.computeActualCellValue(prop, row[prop.column as string]);
                    if (IsHelper.isArray(obj[prop.prop])) {
                        obj[prop.prop].push(cellValue);
                    } else {
                        obj[prop.prop] = [cellValue];
                    }
                }

                // initialize empty to-many relations, they will be populated when
                // those objects build themselves and find this containing object
                for (const prop of objMeta.toManyPropList) {
                    obj[prop] = [];
                }

                // initialize null to-one relations and then recursively build them
                for (const prop of objMeta.toOneList) {
                    obj[prop.prop] = null;
                    recursiveNest(row, IsHelper.isArray(prop.column) ? prop.column : [prop.column]);
                }
            }

            // link from the parent
            if (IsHelper.isNull(objMeta.containingColumn)) {
                // parent is the top level
                if (!IsHelper.isNullOrUndefined(objMeta.isOneOfMany)) {
                    // it is an array
                    if (IsHelper.isNull(this.struct)) {
                        this.struct = [];
                    }
                    (this.struct as any[]).push(obj);
                } else {
                    // it is this object
                    this.struct = obj;
                }
            } else {
                const containingIds = objMeta.containingColumn.map((column) => row[column]);
                const container =
                    meta.idMap[this.createCompositeKey(objMeta.containingColumn)].cache[
                        this.createCompositeKey(containingIds)
                    ];

                // If a container exists, it must not be a root, and thus there should
                // be an ownProp set
                if (!IsHelper.isNullOrUndefined(container)) {
                    if (!IsHelper.isNullOrUndefined(objMeta.isOneOfMany)) {
                        // it is an array
                        container[objMeta.ownProp as string].push(obj);
                    } else {
                        // it is this object
                        container[objMeta.ownProp as string] = obj;
                    }
                }

                // record the containing id so we don't do this again (return in earlier
                // part of this method)
                const containingIdUsage = objMeta.containingIdUsage as IDictionary<IDictionary<boolean>>;
                if (IsHelper.isUndefined(containingIdUsage[this.createCompositeKey(vals)])) {
                    containingIdUsage[this.createCompositeKey(vals)] = {};
                }
                containingIdUsage[this.createCompositeKey(vals)][this.createCompositeKey(containingIds)] = true;
            }
        };

        // struct is populated inside the build function
        this.struct = null;

        for (const row of table) {
            for (const primeIdColumn of meta.primeIdColumnList) {
                // for each prime id column (corresponding to a to-many relation or
                // the top level) attempted to build an object
                recursiveNest(row, primeIdColumn);
            }
        }

        return this.struct;
    }
    /* Returns a property mapping data structure based on the names of columns
     * in columnList. Used internally by nest when its propertyMapping param
     * is not specified.
     *
     */
    public structPropToColumnMapFromColumnHints(columnList: string[], renameMapping?: IDictionary<string>) {
        if (IsHelper.isUndefined(renameMapping)) {
            renameMapping = {};
        }

        const propertyMapping: any = { base: null };

        for (const column of columnList) {
            const columnType = column.split("___");

            let type = null;
            let idFlagSet = false;
            let arrayFlagSet = false;
            for (let j = 1; j < columnType.length; j++) {
                if (columnType[j] === "ID") {
                    idFlagSet = true;
                } else if (!IsHelper.isUndefined(this.typeHandlers[columnType[j]])) {
                    type = columnType[j];
                }
                if (IsHelper.isArray(columnType[j])) {
                    arrayFlagSet = true;
                }
            }

            let pointer = propertyMapping; // point to base on each new column
            let prop: string | number = "base";

            const navList = columnType[0].split("_");

            for (let j = 0; j < navList.length; j++) {
                const nav = navList[j];

                if (IsHelper.isEmptyStringOrWhitespace(nav)) {
                    if (IsHelper.isNull(pointer[prop])) {
                        pointer[prop] = [null];
                    }
                    pointer = pointer[prop];
                    prop = 0;
                } else {
                    if (IsHelper.isNull(pointer[prop])) {
                        pointer[prop] = {};
                    }
                    if (IsHelper.isUndefined(pointer[prop][nav])) {
                        let renamedColumn: any = IsHelper.isUndefined(renameMapping[column])
                            ? column
                            : renameMapping[column];
                        if (
                            !IsHelper.isNull(type) ||
                            !IsHelper.isNullOrUndefined(idFlagSet) ||
                            !IsHelper.isNullOrUndefined(arrayFlagSet)
                        ) {
                            // no longer a simple mapping, has need of the type or id properties
                            renamedColumn = { column: renamedColumn };
                        }
                        if (!IsHelper.isNull(type)) {
                            // detail the type in the column map if type provided
                            renamedColumn.type = type;
                        }
                        if (!IsHelper.isNullOrUndefined(idFlagSet)) {
                            // set the id property in the column map
                            renamedColumn.id = true;
                        }
                        if (!IsHelper.isNullOrUndefined(arrayFlagSet)) {
                            renamedColumn.array = true;
                        }
                        pointer[prop][nav] =
                            j === navList.length - 1
                                ? renamedColumn // is leaf node, store full column string
                                : null; // iteration will replace with object or array
                    }
                    pointer = pointer[prop];
                    prop = nav;
                }
            }
        }

        return propertyMapping.base;
    }

    /* Registers a custom type handler */
    public registerType(name: string, handler: ITypeHandler) {
        if (!IsHelper.isNullOrUndefined(this.typeHandlers[name])) {
            throw new Error("Handler with type, " + name + ", already exists");
        }

        this.typeHandlers[name] = handler;
    }

    private computeActualCellValue(props: IMetaValueProps, initialValue: any) {
        let cellValue = initialValue;
        if (!IsHelper.isNull(cellValue)) {
            let valueTypeFunction: ITypeHandler | undefined;

            if (IsHelper.isFunction(props.type)) {
                valueTypeFunction = props.type as ITypeHandler;
            } else if (IsHelper.isString(props.type)) {
                valueTypeFunction = this.typeHandlers[props.type];
            }

            if (!IsHelper.isNullOrUndefined(valueTypeFunction)) {
                cellValue = valueTypeFunction(cellValue);
            }
        } else if (!IsHelper.isUndefined(props.default)) {
            cellValue = props.default;
        }
        return cellValue;
    }

    /* Create a data structure that contains lookups and cache spaces for quick
     * reference and action for the workings of the nest method.
     */
    private buildMeta(structPropToColumnMap: IDefinition | IDefinition[]): IMetaData {
        // eslint-disable-next-line prefer-const
        let meta: IMetaData;

        // internally defines recursive function with extra param. This allows cleaner API
        const recursiveBuildMeta = (
            structPropToColumnMap: IDefinition,
            isOneOfMany: boolean,
            containingColumn: string[] | null,
            ownProp: string | null
        ) => {
            const idProps = [];
            let idColumns = [];

            const propList = _.keys(structPropToColumnMap);
            if (IsHelper.isEmptyArray(propList.length)) {
                throw new Error(
                    "invalid structPropToColumnMap format - property '" + ownProp + "' can not be an empty array"
                );
            }

            // Add all of the columns flagged as id to the array
            for (const prop of propList) {
                if ((structPropToColumnMap[prop] as IDefinitionColumn).id === true) {
                    idProps.push(prop);
                }
            }

            // If no columns are flagged as id, then use the first value in the prop list
            if (IsHelper.isEmptyArray(idProps)) {
                (idProps as any[]).push(propList[0]);
            }

            idColumns = idProps.map((prop) => {
                return (structPropToColumnMap[prop] as IDefinitionColumn).column || structPropToColumnMap[prop];
            }) as string[];

            if (!IsHelper.isNullOrUndefined(isOneOfMany)) {
                meta.primeIdColumnList.push(idColumns);
            }

            const defaults: IDictionary<string | null> = {};

            idProps.forEach((prop) => {
                defaults[prop] = IsHelper.isUndefined((structPropToColumnMap[prop] as IDefinitionColumn).default)
                    ? null
                    : (structPropToColumnMap[prop] as IDefinitionColumn).default;
            });

            const objMeta: IMetaColumnData = {
                valueList: [],
                toOneList: [],
                arraysList: [],
                toManyPropList: [],
                containingColumn,
                ownProp,
                isOneOfMany,
                cache: {},
                containingIdUsage: IsHelper.isNull(containingColumn) ? null : {},
                defaults,
            };

            for (const prop of propList) {
                if (IsHelper.isString(structPropToColumnMap[prop])) {
                    // value property
                    objMeta.valueList.push({
                        prop,
                        column: structPropToColumnMap[prop] as string,
                        type: undefined,
                        default: undefined,
                    });
                } else if (!IsHelper.isNullOrUndefined((structPropToColumnMap[prop] as IDefinitionColumn).column)) {
                    // value property
                    const definitionColumn = structPropToColumnMap[prop] as IDefinitionColumn;
                    const metaValueProps = {
                        prop,
                        column: definitionColumn.column,
                        type: definitionColumn.type,
                        default: definitionColumn.default,
                    };

                    // Add this column to our array list if necessary
                    if (definitionColumn.array === true) {
                        objMeta.arraysList.push(metaValueProps);
                    } else {
                        objMeta.valueList.push(metaValueProps);
                    }
                } else if (IsHelper.isArray(structPropToColumnMap[prop])) {
                    // list of objects / to-many relation
                    objMeta.toManyPropList.push(prop);

                    recursiveBuildMeta((structPropToColumnMap[prop] as IDefinition[])[0], true, idColumns, prop);
                } else if (IsHelper.isPlainObject(structPropToColumnMap[prop])) {
                    // object / to-one relation

                    const subIdProps = [];

                    for (const value of _.values(structPropToColumnMap[prop])) {
                        if (IsHelper.isPlainObject(value) && value.id) {
                            subIdProps.push(value.column);
                        }
                    }

                    // If no columns are flagged as id, then use the first value in the prop list
                    if (IsHelper.isEmptyArray(subIdProps)) {
                        const column = _.values(structPropToColumnMap[prop])[0];
                        (subIdProps as any[]).push(IsHelper.isPlainObject(column) ? column.column : column);
                    }

                    objMeta.toOneList.push({
                        prop,
                        column: subIdProps as any[],
                    });
                    recursiveBuildMeta(structPropToColumnMap[prop] as IDefinition, false, idColumns, prop);
                } else {
                    throw new Error(
                        "invalid structPropToColumnMap format - property '" +
                            prop +
                            "' must be either a string, a plain object or an array"
                    );
                }
            }

            meta.idMap[this.createCompositeKey(idColumns)] = objMeta;
        };

        // this data structure is populated by the _buildMeta function
        meta = {
            primeIdColumnList: [],
            idMap: {},
        } as IMetaData;

        if (IsHelper.isArray(structPropToColumnMap)) {
            if (structPropToColumnMap.length !== 1) {
                throw new Error(
                    `invalid structPropToColumnMap format - can not have multiple roots for structPropToColumnMap, if an array it must only have one item`
                );
            }
            // call with first object, but inform _buildMeta it is an array
            recursiveBuildMeta((structPropToColumnMap as IDefinition[])[0], true, null, null);
        } else if (IsHelper.isPlainObject(structPropToColumnMap)) {
            // register first column as prime id column
            const columns = _.values(structPropToColumnMap) as any[];

            if (IsHelper.isEmptyArray(columns)) {
                throw new Error("invalid structPropToColumnMap format - the base object can not be an empty object");
            }

            // First determine if there are any keys set on the columns
            const idColumns = columns.reduce((accumulator: string[], column: any) => {
                if (column.id === true) {
                    accumulator.push(column.column);
                }
                return accumulator;
            }, []);

            // If there were no keys set, then take the first column as the id
            if (IsHelper.isEmptyArray(idColumns)) {
                if (IsHelper.isString(columns[0])) {
                    (idColumns as string[]).push(columns[0]);
                } else if (IsHelper.isString(columns[0].column)) {
                    (idColumns as string[]).push(columns[0].column);
                }
            }

            meta.primeIdColumnList.push(idColumns);

            // construct the rest
            recursiveBuildMeta(structPropToColumnMap as IDefinition, false, null, null);
        }
        return meta;
    }

    private createCompositeKey = (vals: Array<string | number>, separator = ", "): string => {
        return vals.join(separator);
    };

    /** Used to help the builder */
    public getGraphTypeFromEntityType = (entityType: string): string => {
        switch (entityType) {
            case "string":
                return `GraphQLString`;
            case "number":
                return `GraphQLInt`;
            case "boolean":
                return `GraphQLBoolean`;
            case "Date":
                return `GraphQLString`;
            default:
                return `GraphQLString`;
        }
    };
}
