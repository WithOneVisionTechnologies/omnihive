import React from "react";
import { Box, Text } from "ink";
import SelectInput, { SelectInputItem } from "../ink/select-input/SelectInput";
import { CliColors } from "../../stores/CommandLineStore";
import { DataSourceType } from "../../enums/DataSourceType";
import { IsHelper } from "src/packages/omnihive-core/helpers/IsHelper";

interface ChooseDataSourceProps {
    selectedDataSource?: DataSourceType;
    dataSourceChange: (dataSource: DataSourceType) => void;
}

const ChooseDataSource: React.FC<ChooseDataSourceProps> = (props): React.ReactElement => {
    const [currentIndex, setCurrentIndex] = React.useState<number>(0);

    React.useEffect(() => {
        if (IsHelper.isNullOrUndefined(props) || IsHelper.isNullOrUndefined(props.selectedDataSource)) {
            return;
        }

        const selectedIndex: number = menuItems.findIndex((item) => item.value === props.selectedDataSource);
        setCurrentIndex(selectedIndex);
    });

    const menuItems: SelectInputItem<string>[] = [
        {
            label: "JSON",
            value: DataSourceType.JSON,
        },
        {
            label: "YAML",
            value: DataSourceType.YAML,
        },
        {
            label: "Postgres",
            value: DataSourceType.Postgres,
        },
        {
            label: "MySQL",
            value: DataSourceType.MySQL,
        },
        {
            label: "MSSQL",
            value: DataSourceType.MSSQL,
        },
        {
            label: "SQLite",
            value: DataSourceType.SQLite,
        },
    ];

    const onSelectHandler = (item: SelectInputItem<any>) => {
        if (item.value !== "go-back" && !IsHelper.isNullOrUndefined(props.dataSourceChange)) {
            props.dataSourceChange(item.value);
        }
    };

    return (
        <Box marginTop={1} flexDirection="column">
            <Box marginBottom={1}>
                <Text color={CliColors.darkYellow} underline={true}>
                    Choose Data Source
                </Text>
            </Box>
            <SelectInput
                currentIndex={currentIndex}
                focusColor={CliColors.darkYellow}
                items={menuItems}
                onSelect={onSelectHandler}
            />
        </Box>
    );
};

export default ChooseDataSource;
