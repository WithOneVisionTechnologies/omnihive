/// <reference path="./@types/arr-rotate.ts" />

import React from "react";
import isEqual from "lodash.isequal";
import { Box, useInput } from "ink";
import IndicatorRenderer, { IndicatorRendererProps } from "./IndicatorRenderer";
import ItemRenderer, { ItemRendererProps } from "./ItemRenderer";
import arrayRotate from "arr-rotate";

interface SelectInputProps<T> {
    /**
     * Items to display in a list. Each item must be an object and have `label` and `value` props, it may also optionally have a `key` prop.
     * If no `key` prop is provided, `value` will be used as the item key.
     */
    items?: Array<SelectInputItem<T>>;

    /**
     * Optional controlled index of item in `items` array.
     */
    currentIndex?: number;

    /**
     * Listen to user's input. Useful in case there are multiple input components at the same time and input must be "routed" to a specific component.
     *
     * @default true
     */
    isFocused?: boolean;

    /**
     * The color for focused items.
     */
    focusColor: string;

    /**
     * Index of initially-selected item in `items` array.
     *
     * @default 0
     */
    initialIndex?: number;

    /**
     * Number of items to display.
     */
    limit?: number;

    /**
     * Custom component to override the default indicator component.
     */
    indicatorRenderer?: React.FC<IndicatorRendererProps>;

    /**
     * Custom component to override the default item component.
     */
    itemRenderer?: React.FC<ItemRendererProps>;

    /**
     * Function to call when user selects an item. Item object is passed to that function as an argument.
     */
    onSelect?: (item: SelectInputItem<T>) => void;

    /**
     * Function to call when user highlights an item. Item object is passed to that function as an argument.
     */
    onHighlight?: (item: SelectInputItem<T>, index: number) => void;
}

export interface SelectInputItem<T> {
    key?: string;
    label: string;
    value: T;
}

// eslint-disable-next-line react/function-component-definition
const SelectInput: React.FC<SelectInputProps<any>> = ({
    items = [],
    currentIndex,
    isFocused = true,
    focusColor = "blue",
    initialIndex = 0,
    indicatorRenderer: indicatorRenderer = IndicatorRenderer,
    itemRenderer: itemRenderer = ItemRenderer,
    limit: customLimit,
    onSelect,
    onHighlight,
}): React.ReactElement => {
    const [rotateIndex, setRotateIndex] = React.useState(0);
    const [selectedIndex, setSelectedIndex] = React.useState(
        typeof currentIndex === "number" ? currentIndex : initialIndex
    );
    const hasLimit = typeof customLimit === "number" && items.length > customLimit;
    const limit = hasLimit ? Math.min(customLimit!, items.length) : items.length;

    const previousItems = React.useRef<Array<SelectInputItem<any>>>(items);

    React.useEffect(() => {
        if (
            !isEqual(
                previousItems.current.map((item) => item.value),
                items.map((item) => item.value)
            )
        ) {
            setRotateIndex(0);
            setSelectedIndex(0);
        }

        previousItems.current = items;
    }, [items]);

    React.useEffect(() => {
        if (typeof currentIndex === "number") {
            setRotateIndex(currentIndex);
            setSelectedIndex(currentIndex);
        }
    }, [currentIndex]);

    useInput(
        React.useCallback(
            (input, key) => {
                if (input === "k" || key.upArrow) {
                    const lastIndex = (hasLimit ? limit : items.length) - 1;
                    const atFirstIndex = selectedIndex === 0;
                    const nextIndex = hasLimit ? selectedIndex : lastIndex;
                    const nextRotateIndex = atFirstIndex ? rotateIndex + 1 : rotateIndex;
                    const nextSelectedIndex = atFirstIndex ? nextIndex : selectedIndex - 1;

                    setRotateIndex(nextRotateIndex);
                    setSelectedIndex(nextSelectedIndex);

                    const slicedItems = hasLimit ? arrayRotate(items, nextRotateIndex).slice(0, limit) : items;

                    if (typeof onHighlight === "function") {
                        onHighlight(slicedItems[nextSelectedIndex], nextSelectedIndex);
                    }
                }

                if (input === "j" || key.downArrow) {
                    const atLastIndex = selectedIndex === (hasLimit ? limit : items.length) - 1;
                    const nextIndex = hasLimit ? selectedIndex : 0;
                    const nextRotateIndex = atLastIndex ? rotateIndex - 1 : rotateIndex;
                    const nextSelectedIndex = atLastIndex ? nextIndex : selectedIndex + 1;

                    setRotateIndex(nextRotateIndex);
                    setSelectedIndex(nextSelectedIndex);

                    const slicedItems = hasLimit ? arrayRotate(items, nextRotateIndex).slice(0, limit) : items;

                    if (typeof onHighlight === "function") {
                        onHighlight(slicedItems[nextSelectedIndex], nextSelectedIndex);
                    }
                }

                if (key.return) {
                    const slicedItems = hasLimit ? arrayRotate(items, rotateIndex).slice(0, limit) : items;

                    if (typeof onSelect === "function") {
                        onSelect(slicedItems[selectedIndex]);
                    }
                }
            },
            [hasLimit, limit, rotateIndex, selectedIndex, items, onSelect, onHighlight]
        ),
        { isActive: isFocused }
    );

    const slicedItems = hasLimit ? arrayRotate(items, rotateIndex).slice(0, limit) : items;

    return (
        <Box flexDirection="column">
            {slicedItems.map((item, index) => {
                const isSelected = index === selectedIndex;

                return (
                    <Box key={item.key ?? item.value}>
                        {React.createElement(indicatorRenderer, { isSelected, focusColor })}
                        {React.createElement(itemRenderer, { ...item, isSelected, focusColor })}
                    </Box>
                );
            })}
        </Box>
    );
};

export default SelectInput;
