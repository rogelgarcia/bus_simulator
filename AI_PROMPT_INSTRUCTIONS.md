# AI Prompt Creation Instructions

This file contains guidelines for creating effective AI prompts for code modifications and development tasks.

## Prompt Structure

Every AI prompt request should consist of **3 main parts**:

### 1. The Request Itself
- Clearly state what you want to accomplish
- Be specific about the desired outcome
- Include any constraints or requirements

### 2. Default Requirements

All prompts should include the following default requirements:

#### Output Format
- **All outputs must be the entire file (modified or created)**
- Do not provide partial files or snippets
- Include complete file contents for both new and modified files
- Use an specific file name AI_#_title

#### Refactoring
- **If a refactoring is needed, that can be done**
- Feel free to restructure code for better organization
- Improve code quality and maintainability as needed

#### Convention Changes
- **If there is a convention but it seems wrong, that can be changed**
- Don't be constrained by existing patterns if they're suboptimal
- Propose and implement better conventions when appropriate

#### Missing Files
- **If a crucial file is missing, request the file prior to making any changes**
- Don't assume file contents
- Ask for necessary context before proceeding

### 3. Attached Files

For the attached files section:

#### Step 1: Identify Relevant Files/Folders
- Find all files and folders relevant to the request
- Consider dependencies and related components
- Include configuration files if applicable
- **When in doubt, add the file** - This is for an expensive AI processor that can leverage extra context effectively
- Include a list of the files that were attached (if all files in a folder are attached, only add the folder name)

#### Step 2: Add Project Directory Tree
- **Execute a command to output the project structure**
- Include complete file paths for relevant file types (.js, .css, etc.)
- This helps the AI understand the project layout and available files

Example commands:
```bash
# Unix/Linux/macOS
find . -type f \( -name "*.js" -o -name "*.css" \) | grep -v node_modules | sort >> prompt_request.txt

# Windows PowerShell
Get-ChildItem -Path . -Include *.js,*.css -Recurse | Where-Object { $_.FullName -notmatch 'node_modules' } | Select-Object -ExpandProperty FullName | Sort-Object | Add-Content -Path prompt_request.txt
```

#### Step 3: Execute Batch Command to Output Files
- **Do not manually copy file contents**
- Use a batch command to output all relevant files to the request file
- This ensures accuracy and completeness
- **Note**: The filename is already included in each file, so when attaching files, it is not needed to also put the file name in the output

## Template

```markdown
# Request

[Your specific request here]

## Requirements

- All outputs must be the entire file (modified or created)
- If a refactoring is needed, that can be done
- If there is a convention but it seems wrong, that can be changed
- If a crucial file is missing, request the file prior to making any changes

## Project Structure

[Use batch command to append project directory tree here]

## Attached Files

[Use batch command to append file contents here]
```

## Best Practices

1. **Be Specific**: Clearly articulate what you want to achieve
2. **Provide Context**: Include all relevant files and dependencies
3. **Use Automation**: Always use batch commands for file contents
4. **Complete Information**: Don't leave out important files or context
5. **When in Doubt, Include It**: The AI processor is expensive and can effectively leverage extra context
6. **Save the Request**: Store the complete request in a file for reference

