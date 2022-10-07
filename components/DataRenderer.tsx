import { ParamType } from "@ethersproject/abi";
import { BigNumber, ethers } from "ethers";
import { TraceMetadata } from "./types";
import * as React from "react";

let formatValueWithParamType = (
  paramType: ParamType,
  value: any,
  truncate: boolean,
  makeLink: boolean,
  labels?: Record<string, string>
): JSX.Element => {
  if (paramType.indexed && value.hash) {
    return <>value.hash</>;
  }

  if (paramType.baseType === "address") {
    let address = value.toString().toLowerCase();
    let label = ethers.utils.getAddress(address);
    if (labels && labels[address]) {
      label = `[${labels[address]}]`;
    }

    if (makeLink) {
      return (
        <a
          href={`https://etherscan.io/address/${address}`}
          target={"_blank"}
          rel={"noopener noreferrer"}
        >
          {label}
        </a>
      );
    } else {
      return <>{label}</>;
    }
  }

  let encoded = value.toString();
  if (encoded.length > 96 && truncate) {
    encoded =
      encoded.substring(0, 8) + "..." + encoded.substring(encoded.length - 8);
  }
  return <>{encoded}</>;
};

type DataRendererProps = {
  meta: TraceMetadata;
  data?: string;
  decodedData?: any;
  makeLink?: boolean;
  preferredType: string | null;
  truncate?: boolean;
};

export const DataRenderer = (props: DataRendererProps) => {
  const abiCoder = ethers.utils.defaultAbiCoder;

  let preferredType = props.preferredType || "bytes32";
  let decodedData = props.decodedData;
  let data = props.data;
  let makeLink = props.makeLink === undefined ? true : props.makeLink;
  let truncate = props.truncate;

  let suffix = null;
  if (data) {
    if (data.startsWith("0x")) data = data.substring(2);
    data = "0x" + data.padStart(64, "0");
  }

  if (preferredType === "stringHeader" && data) {
    if (BigNumber.from(data).isZero()) {
      preferredType = "uint256";
      decodedData = BigNumber.from(0);
      suffix = <>&nbsp;(length)</>;
    } else {
      let lowestBit = parseInt(data.substring(data.length - 2)) & 0x01;
      if (lowestBit) {
        preferredType = "uint256";
        decodedData = BigNumber.from(data).sub(BigNumber.from(1));
        suffix = <>&nbsp;(length)</>;
      } else {
        preferredType = "ascii";
        data = data.substring(0, data.length - 2) + "00";
      }
    }
  }

  if (preferredType === "ascii" && data) {
    data = data.replace(/(00)+$/g, "");
    return <>&apos;{ethers.utils.toUtf8String(data)}&apos;</>;
  }

  let paramType = ParamType.from(preferredType);
  if (paramType.type === "contract") {
    paramType = ParamType.from("address");
  }

  try {
    if (decodedData === undefined && data) {
      decodedData = abiCoder.decode([paramType], data);
    }

    let rendered = formatValueWithParamType(
      paramType,
      decodedData,
      truncate || false,
      makeLink,
      props.meta.labels
    );
    return (
      <>
        {rendered}
        {suffix}
      </>
    );
  } catch (e) {
    return <>{props.data}</>;
  }
};
