import React from "react";
import { IsHelper } from "@withonevision/omnihive-core/helpers/IsHelper";
import TextInput, { TextInputMode } from "../ink-forked/text-input/TextInput";
import { Text, Box } from "ink";
import { CliColors } from "../../stores/CommandLineStore";

interface TextQuestionProps {
    initialText?: string;
    onTextChange: (returnText: string) => void;
    textTitle: string;
    question: string;
    mode?: TextInputMode;
}

const TextQuestion: React.FC<TextQuestionProps> = (props): React.ReactElement => {
    const [textValue, setTextValue] = React.useState<string>("");

    React.useEffect(() => {
        if (!IsHelper.isNullOrUndefinedOrEmptyStringOrWhitespace(props.initialText)) {
            setTextValue(props.initialText);
        }
    }, [props]);

    const onSubmitHandler = (newText: string) => {
        if (!IsHelper.isNullOrUndefinedOrEmptyStringOrWhitespace(newText)) {
            props.onTextChange(newText);
        }
    };

    return (
        <Box marginTop={1} flexDirection="column">
            <Box marginBottom={1}>
                <Text color={CliColors.lightYellow}>{props.question}</Text>
            </Box>
            <Box flexDirection={"row"}>
                <Box marginRight={1}>
                    <Text>{props.textTitle}:</Text>
                </Box>
                <TextInput
                    mode={props.mode ?? TextInputMode.Alphanumeric}
                    showCursor={true}
                    value={textValue}
                    onChange={setTextValue}
                    onSubmit={onSubmitHandler}
                />
            </Box>
        </Box>
    );
};

export default TextQuestion;
