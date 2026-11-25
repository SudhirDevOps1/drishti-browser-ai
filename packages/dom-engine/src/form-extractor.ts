export interface FormField {
  name?: string;
  id?: string;
  type: string;
  label?: string;
  placeholder?: string;
  value?: string;
  required: boolean;
  options?: string[];
  selector: string;
}

export interface ExtractedForm {
  index: number;
  id?: string;
  action?: string;
  method?: string;
  fields: FormField[];
}

export function extractForms(): ExtractedForm[] {
  if (typeof document === 'undefined') return [];
  const forms = Array.from(document.querySelectorAll('form'));

  return forms.map((form, i) => {
    const fields: FormField[] = [];
    const inputs = Array.from(
      form.querySelectorAll('input:not([type="hidden"]), select, textarea')
    );

    inputs.forEach((input) => {
      const id = (input as HTMLInputElement).id;
      const name = (input as HTMLInputElement).name;
      const type = (input as HTMLInputElement).type || input.tagName.toLowerCase();

      let label: string | undefined;
      if (id) {
        label = document.querySelector(`label[for="${id}"]`)?.textContent?.trim();
      }
      if (!label) {
        label = input.closest('label')?.textContent?.trim();
      }

      const field: FormField = {
        name: name || undefined,
        id: id || undefined,
        type,
        label,
        required: !!(input as HTMLInputElement).required,
        selector: id ? `#${id}` : name ? `[name="${name}"]` : input.tagName.toLowerCase(),
      };

      if (type !== 'password') {
        field.placeholder = (input as HTMLInputElement).placeholder || undefined;
        field.value = (input as HTMLInputElement).value || undefined;
      }

      if (input instanceof HTMLSelectElement) {
        field.options = Array.from(input.options).map((o) => o.text);
      }

      fields.push(field);
    });

    return {
      index: i,
      id: form.id || undefined,
      action: form.action || undefined,
      method: form.method || undefined,
      fields,
    };
  }).slice(0, 15);
}
