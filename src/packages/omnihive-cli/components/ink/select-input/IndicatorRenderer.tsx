import React from "react";
import { Box, Text } from "ink";
import figures from "figures";

export interface IndicatorRendererProps {
    isSelected?: boolean;
    focusColor: string;
}

const IndicatorRenderer: React.FC<IndicatorRendererProps> = ({
    isSelected = false,
    focusColor,
}): React.ReactElement => (
    <Box marginRight={1}>{isSelected ? <Text color={focusColor}>{figures.pointer}</Text> : <Text> </Text>}</Box>
);

export default IndicatorRenderer;
