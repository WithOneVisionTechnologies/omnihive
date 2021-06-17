import React from "react";
import { Box, Text } from "ink";
import SelectInput, { SelectInputItem } from "../../components/select-input/SelectInput";
import { CommandLinePage } from "../../enums/CommandLinePage";
import { useAtom } from "jotai";
import {
    CliColors,
    moveToNewPageAtom,
    goBackOnePageAtom,
    baseMenuItemsAtom,
    createInstanceParametersAtom,
} from "../../stores/CommandLineStore";
import { CreateDataSourceType } from "../../enums/CreateDataSourceType";

const CreateChooseDataSource: React.FC = (): React.ReactElement => {
    const [baseMenuItems] = useAtom(baseMenuItemsAtom);
    const [createInstanceParameters, setCreateInstanceParameters] = useAtom(createInstanceParametersAtom);
    const [, goBackOnePage] = useAtom(goBackOnePageAtom);
    const [, moveToNewPage] = useAtom(moveToNewPageAtom);

    const [currentIndex, setCurrentIndex] = React.useState<number>(0);

    React.useEffect(() => {
        const selectedIndex: number = menuItems.findIndex(
            (item) => item.value === createInstanceParameters.dataSourceType
        );
        setCurrentIndex(selectedIndex);
    });

    const menuItems: SelectInputItem<string>[] = [
        {
            label: "JSON",
            value: CreateDataSourceType.JSON,
        },
        {
            label: "YAML",
            value: CreateDataSourceType.YAML,
        },
        {
            label: "Postgres",
            value: CreateDataSourceType.Postgres,
        },
        {
            label: "MySQL",
            value: CreateDataSourceType.MySQL,
        },
        {
            label: "MSSQL",
            value: CreateDataSourceType.MSSQL,
        },
        {
            label: "SQLite",
            value: CreateDataSourceType.SQLite,
        },
        ...baseMenuItems,
    ];

    const onSelectHandler = (item: SelectInputItem<any>) => {
        if (item.value !== "go-back") {
            setCreateInstanceParameters({ ...createInstanceParameters, dataSourceType: item.value });
        }

        switch (item.value) {
            case CreateDataSourceType.JSON:
                moveToNewPage(CommandLinePage.CreateInstance_DataSource);
                break;
            case "edit":
                moveToNewPage(CommandLinePage.EditInstance);
                break;
            case "go-back":
                goBackOnePage();
                break;
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

export default CreateChooseDataSource;
