import React from "react";
import { useAtom } from "jotai";
import { createInstanceModelAtom, currentPageAtom } from "../../stores/CommandLineStore";
import { CommandLinePage } from "../../enums/CommandLinePage";
import ChooseDataSource from "../common/ChooseDataSource";
import { DataSourceType } from "../../enums/DataSourceType";

const CreateRoot: React.FC = (): React.ReactElement => {
    const [currentPage] = useAtom(currentPageAtom);
    const [createInstanceModel, setCreateInstanceRoot] = useAtom(createInstanceModelAtom);

    const onSelectDataSource = (dataSourceType: DataSourceType) => {
        setCreateInstanceRoot({ ...createInstanceModel, dataSourceType });
    };

    return (
        <>
            {(currentPage === CommandLinePage.CreateInstance_Root ||
                currentPage === CommandLinePage.CreateInstance_DataSource) && (
                <ChooseDataSource
                    selectedDataSource={createInstanceModel.dataSourceType}
                    dataSourceChange={onSelectDataSource}
                />
            )}
        </>
    );
};

export default CreateRoot;
