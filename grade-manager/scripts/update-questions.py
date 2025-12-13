#!/usr/bin/env python3
"""
Script to remove complexity questions and add code output questions
"""

import re
import sys

def main():
    # Read current questions
    with open('public/student/data/cs50-questions.xml', 'r', encoding='utf-8') as f:
        content = f.read()

    # Split into individual questions
    questions = re.findall(r'<question type="multichoice">.*?</question>', content, re.DOTALL)

    print(f"Total questions found: {len(questions)}")

    # Filter out complexity questions
    filtered_questions = []
    removed_count = 0

    for question in questions:
        # Check if question contains complexity/Log/Omega keywords
        if any(keyword in question for keyword in ['complexity', 'Omega', 'Big O', 'О(', 'Θ(']):
            removed_count += 1
            continue
        filtered_questions.append(question)

    print(f"Removed {removed_count} complexity questions")
    print(f"Remaining questions: {len(filtered_questions)}")

    # Read new code output questions
    with open('public/student/data/code-output-questions.xml', 'r', encoding='utf-8') as f:
        new_content = f.read()

    new_questions = re.findall(r'<question type="multichoice">.*?</question>', new_content, re.DOTALL)
    print(f"Adding {len(new_questions)} new code output questions")

    # Combine
    all_questions = filtered_questions + new_questions
    print(f"Total after merge: {len(all_questions)}")

    # Build new XML
    output = '<?xml version="1.0" encoding="UTF-8"?>\n<quiz>\n'
    output += '\n'.join(all_questions)
    output += '\n</quiz>\n'

    # Save
    with open('public/student/data/cs50-questions-updated.xml', 'w', encoding='utf-8') as f:
        f.write(output)

    print("\n✅ Saved to: public/student/data/cs50-questions-updated.xml")
    print(f"📊 Final count: {len(all_questions)} questions")

if __name__ == '__main__':
    main()
