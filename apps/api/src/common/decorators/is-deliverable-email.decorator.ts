import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';
import { validateEmail } from '@tfhc/shared';

export function IsDeliverableEmail(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isDeliverableEmail',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any) {
          if (value === undefined || value === null) return true;
          if (typeof value !== 'string') return false;
          const result = validateEmail(value);
          return result.isValid;
        },
        defaultMessage(args: ValidationArguments) {
          const result = validateEmail(args.value);
          return result.reason || `${args.property} must be a valid, deliverable email address`;
        },
      },
    });
  };
}
