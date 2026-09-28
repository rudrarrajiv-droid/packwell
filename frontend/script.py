import re
with open('d:/AI/pi_git/packwell/frontend/src/pages/MasterData.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

text = re.sub(
    r'const \{ user \} = useAuth\(\);\n\s*const canDelete = user\?\.email === \'admin@packwell\.com\' \|\| user\?\.email === \'packwell@packwell\.com\';\n\s*const showCosting = user\?\.email === \'admin@packwell\.com\' \|\| user\?\.email === \'packwell@packwell\.com\';',
    r'const { user, hasRole } = useAuth();\n  const isAdmin = hasRole(\"ADMIN\") || user?.email === \"admin@packwell.com\" || user?.email === \"packwell@packwell.com\";\n  const canDelete = isAdmin;\n  const showCosting = isAdmin;',
    text,
    count=1
)

text = re.sub(
    r'function CustomersTable\(\{ data, products, isLoading, onEdit, onDelete, onMerge \}: \{ data: Customer\[\]; products: Product\[\]; isLoading: boolean, onEdit: \(c: Customer\) => void, onDelete\?: \(c: Customer\) => void, onMerge\?: \(c: Customer\) => void \}\)',
    r'function CustomersTable({ data, products, isLoading, onEdit, onDelete, onMerge }: { data: Customer[]; products: Product[]; isLoading: boolean, onEdit?: (c: Customer) => void, onDelete?: (c: Customer) => void, onMerge?: (c: Customer) => void })',
    text,
    count=1
)

text = re.sub(
    r'function ProductsTable\(\{\s*data, isLoading, onEdit, onDelete, onMerge,\s*selectedProducts, onToggleSelect, onToggleSelectAll, showCosting\s*\}\s*:\s*\{\s*data: any\[\]; isLoading: boolean, onEdit: \(p: Product\) => void',
    r'function ProductsTable({\n  data, isLoading, onEdit, onDelete, onMerge,\n  selectedProducts, onToggleSelect, onToggleSelectAll, showCosting\n}: {\n  data: any[]; isLoading: boolean, onEdit?: (p: Product) => void',
    text,
    count=1
)

text = re.sub(
    r'<button onClick=\{\(\) => onEdit\(c\)\} className=\"text-primary hover:bg-primary/10 p-2 rounded-md transition-colors opacity-0 group-hover:opacity-100\" title=\"Edit\">\s*<Edit className=\"w-4 h-4\" />\s*</button>',
    r'{onEdit && (\n                  <button onClick={() => onEdit(c)} className=\"text-primary hover:bg-primary/10 p-2 rounded-md transition-colors opacity-0 group-hover:opacity-100\" title=\"Edit\">\n                    <Edit className=\"w-4 h-4\" />\n                  </button>\n                )}',
    text,
    count=1
)

text = re.sub(
    r'<button onClick=\{\(\) => onEdit\(p\)\} className=\"font-semibold text-primary hover:underline text-left\">\s*\{p\.itemName \|\| \'-\'\}\s*</button>',
    r'{onEdit ? (\n                  <button onClick={() => onEdit(p)} className=\"font-semibold text-primary hover:underline text-left\">\n                    {p.itemName || \"-\"}\n                  </button>\n                ) : (\n                  <span className=\"font-semibold text-foreground\">{p.itemName || \"-\"}</span>\n                )}',
    text,
    count=1
)

text = re.sub(
    r'<button onClick=\{\(\) => onEdit\(p\)\} className=\"text-primary hover:bg-primary/10 p-2 rounded-md transition-colors opacity-0 group-hover:opacity-100\" title=\"Edit\">\s*<Edit className=\"w-4 h-4\" />\s*</button>',
    r'{onEdit && (\n                    <button onClick={() => onEdit(p)} className=\"text-primary hover:bg-primary/10 p-2 rounded-md transition-colors opacity-0 group-hover:opacity-100\" title=\"Edit\">\n                      <Edit className=\"w-4 h-4\" />\n                    </button>\n                  )}',
    text,
    count=1
)

with open('d:/AI/pi_git/packwell/frontend/src/pages/MasterData.tsx', 'w', encoding='utf-8') as f:
    f.write(text)
print("Done!")
