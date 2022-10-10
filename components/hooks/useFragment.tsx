import * as React from 'react';
import { ConstructorFragment, ErrorFragment, EventFragment, Fragment, FunctionFragment } from '@ethersproject/abi';

const useFragmentInternal = <S extends Fragment>(
    initialFragment: S | null,
    defaultValue: string,
    fragmentParser: (v: string) => S | null,
): [string, React.Dispatch<React.SetStateAction<string>>, S | null] => {
    const [fragment, setFragment] = React.useState(initialFragment);

    const [fragmentString, setFragmentString] = React.useState(
        initialFragment ? initialFragment.format('full') : defaultValue,
    );

    const setFragmentStringHook = (action: React.SetStateAction<string>) => {
        setFragmentString((prevState) => {
            let newFragmentString;
            if (typeof action === 'string') {
                newFragmentString = action;
            } else {
                newFragmentString = action(prevState);
            }

            let newFragment;
            try {
                newFragment = fragmentParser(newFragmentString);
            } catch {}

            if (newFragment) {
                setFragment(newFragment);
            }

            return newFragmentString;
        });
    };

    return [fragmentString, setFragmentStringHook, fragment];
};

export const useFunctionFragment = (
    initialFragment: FunctionFragment | null,
    defaultValue: string,
): [string, React.Dispatch<React.SetStateAction<string>>, FunctionFragment | null] => {
    return useFragmentInternal(initialFragment, defaultValue, (v) => {
        let newFragment = Fragment.from(v);
        return newFragment instanceof FunctionFragment ? newFragment : null;
    });
};

export const useErrorFragment = (
    initialFragment: ErrorFragment | null,
    defaultValue: string,
): [string, React.Dispatch<React.SetStateAction<string>>, ErrorFragment | null] => {
    return useFragmentInternal(initialFragment, defaultValue, (v) => {
        let newFragment = Fragment.from(v);
        return newFragment instanceof ErrorFragment ? newFragment : null;
    });
};

export const useEventFragment = (
    initialFragment: EventFragment | null,
    defaultValue: string,
): [string, React.Dispatch<React.SetStateAction<string>>, EventFragment | null] => {
    return useFragmentInternal(initialFragment, defaultValue, (v) => {
        let newFragment = Fragment.from(v);
        return newFragment instanceof EventFragment ? newFragment : null;
    });
};

export const useConstructorFragment = (
    initialFragment: ConstructorFragment | null,
    defaultValue: string,
): [string, React.Dispatch<React.SetStateAction<string>>, ConstructorFragment | null] => {
    return useFragmentInternal(initialFragment, defaultValue, (v) => {
        let newFragment = Fragment.from(v);
        return newFragment instanceof ConstructorFragment ? newFragment : null;
    });
};
