
export const transformDecoderInput = (jsonInput: any) => {
    const keys = Object.keys(jsonInput);

    keys.forEach(key => {
        if (key === 'children') {
            jsonInput[key].forEach((child: any) => {
                transformDecoderInput(child);
            });
        } else if (key === 'calldata' || key === 'returndata') {
            jsonInput[key] = Object.values(jsonInput[key]);
        }
    })
}
