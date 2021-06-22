import React from "react";
import { IsHelper } from "@withonevision/omnihive-core/helpers/IsHelper";
import TextInput from "../ink-forked/text-input/TextInput";
import { Text, Box } from "ink";
import { CliColors } from "../../stores/CommandLineStore";

interface TextQuestionProps {
    selectedText?: string;
    onTextChange: (returnText: string) => void;
    title: string;
}

const TextQuestion: React.FC<TextQuestionProps> = (props): React.ReactElement => {
    const [textValue, setTextValue] = React.useState<string>("");

    React.useEffect(() => {
        if (!IsHelper.isNullOrUndefinedOrEmptyStringOrWhitespace(props.selectedText)) {
            setTextValue(props.selectedText);
        }
    });

    const onChangeHandler = (newText: string) => {
        setTextValue(newText);
    };

    const onSubmitHandler = (newText: string) => {
        if (!IsHelper.isNullOrUndefinedOrEmptyStringOrWhitespace(newText)) {
            props.onTextChange(newText);
        }
    };

    return (
        <Box marginTop={1} flexDirection="column">
            <Box marginBottom={1}>
                <Text color={CliColors.lightYellow}>Where would you like your {props.title} to be located?</Text>
            </Box>
            <Box flexDirection={"row"}>
                <Box marginRight={1}>
                    <Text>File Location:</Text>
                </Box>
                <TextInput showCursor={true} value={textValue} onChange={onChangeHandler} onSubmit={onSubmitHandler} />
            </Box>
        </Box>
    );
};

export default TextQuestion;
