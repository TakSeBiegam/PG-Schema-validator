import { FieldType, Options, ParserField, TypeDefinition } from 'graphql-js-tree';

const GqlScalars = ['INT', 'FLOAT', 'STRING', 'BOOLEAN', 'ID'];
type GqlEnum = {
  name: string;
  fields: string[];
};

const handleConstraintDirective = (arg: ParserField) => {
  switch (arg.name) {
    case 'maxLength':
      return `(${arg.value?.value})`;
    case 'format':
    case 'pattern':
      return ` ${arg.value?.value}`;
    default:
      console.error(`NOT HANDLED CONSTRAINT DIRECTIVE ARGUMENT ${arg.name}`);
      break;
  }
};

const convertDirective = (directive: ParserField) => {
  switch (directive.name) {
    case 'constraint': {
      return handleConstraintDirective(directive.args[0]);
    }
    default:
      console.error('NOT HANDLED DIRECTIVE');
  }
};

const convertScalarsToUpperCase = (input: string): string =>
  GqlScalars.indexOf(input.toUpperCase()) !== -1 ? input.toUpperCase() : input;

const checkFieldTypeIsScalar = (enumName: string, enumArray: GqlEnum[]) =>
  enumArray.some((enumObj) => enumObj.name === enumName);

const findEnumByName = (enumName: string, enumArray: GqlEnum[]): GqlEnum => {
  const e = enumArray.find((enumObj) => enumObj.name === enumName);
  if (!e) {
    throw new Error('UNKNOWN ENUM TYPE');
  }
  return e;
};

const convertToEnumOrScalar = (
  obj: {
    type: Options.name;
    name: string;
  },
  enumArray: GqlEnum[],
) =>
  checkFieldTypeIsScalar(obj.name, enumArray)
    ? `ENUM(${findEnumByName(obj.name, enumArray).fields.map((f) => `"${f}"`)}) `
    : convertScalarsToUpperCase(obj.name);

const convertToArrayScalar = (obj: { type: Options.array; nest: FieldType }) => {
  if (obj.nest.type === Options.required) {
    if (obj.nest.nest.type === Options.name) {
      return `${convertScalarsToUpperCase(obj.nest.nest.name)} ARRAY`;
    }
  }
  console.error(`NOT HANDLED TYPE (got: ${obj})`);
  return '<UNKNOWN>';
};

const getEnums = (nodes: ParserField[]) => {
  const enums = nodes.map((node): GqlEnum | undefined => {
    if (node.type.fieldType.type === Options.name && node.type.fieldType.name === 'enum') {
      return {
        fields: node.args.map((a) => a.name),
        name: node.name,
      };
    }
  });
  return enums.filter((e): e is GqlEnum => !!e);
};

const checkIfNodeIsObject = (obj: ParserField, nodes: ParserField[]) =>
  nodes.some((node) => obj.type.fieldType.type === Options.name && node.id === obj.type.fieldType.name);

const getObjects = (nodes: ParserField[]) =>
  nodes.filter((node) => node.data.type === TypeDefinition.ObjectTypeDefinition);

export const CreateGraphWithoutInputs = (nodes: ParserField[]) => {
  let result = '';
  let enumArray = getEnums(nodes);
  let objectsArray = getObjects(nodes);
  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (node.type.fieldType.type === Options.name && node.type.fieldType.name === 'enum') continue;
    result += node.args.every((arg) => arg && arg.args && arg.args.length > 0)
      ? ''
      : `\n  (${node.name}: ${node.name} {` +
        node.args.map((arg) => {
          const isRequired = arg.type.fieldType.type === Options.required;
          const isNested = checkIfNodeIsObject(arg, objectsArray);
          const curArg =
            arg.type.fieldType.type === Options.name
              ? convertToEnumOrScalar(arg.type.fieldType, enumArray)
              : arg.type.fieldType.nest.type === Options.name
              ? convertScalarsToUpperCase(arg.type.fieldType.nest.name)
              : arg.type.fieldType.nest.type === Options.array
              ? convertToArrayScalar(arg.type.fieldType.nest)
              : (console.error(`NOT HANDLED TYPE (got: ${node})`), '<UNKNOWN>');
          const dir = arg.directives.length ? convertDirective(arg.directives[0]) : undefined;
          return `${isRequired ? '' : ' OPTIONAL'} ${isNested ? curArg : arg.name + ' ' + curArg}${!!dir ? dir : ''}`;
        }) +
        ` }),`;
  }
  return result;
};

export const CreateGraphWithInputs = (nodes: ParserField[]) => {
  return nodes.flatMap((node, i) =>
    node.args.length
      ? node.args
          .flatMap((arg) => {
            if (arg.args.length) {
              const curArg =
                arg.type.fieldType.type === Options.name
                  ? convertScalarsToUpperCase(arg.type.fieldType.name)
                  : arg.type.fieldType.nest.type === Options.name
                  ? convertScalarsToUpperCase(arg.type.fieldType.nest.name)
                  : '<UNKNOWN>';
              return `\n  (:${node.name})-[${arg.args.flatMap(
                (input) =>
                  `${input.name}: ${
                    input.type.fieldType.type === Options.name
                      ? input.type.fieldType.name
                      : input.type.fieldType.nest.type === Options.name
                      ? input.type.fieldType.nest.name
                      : '<UNKNOWN>'
                  }`,
              )}]->(:${curArg})`;
            }
            return '';
          })
          .filter(Boolean)
      : '',
  );
};