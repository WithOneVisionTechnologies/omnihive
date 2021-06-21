import React from "react";
import { Text } from "ink";

export interface ItemRendererProps {
    isSelected?: boolean;
    label: string;
    focusColor: string;
}

const ItemRenderer: React.FC<ItemRendererProps> = ({ isSelected = false, label, focusColor }): React.ReactElement => (
    <Text color={isSelected ? focusColor : undefined}>{label}</Text>
);

export default ItemRenderer;
