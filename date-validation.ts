type FormatToken = 'YYYY' | 'MM' | 'DD' | 'HH' | 'hh' | 'mm' | 'A';

const TOKEN_PATTERNS: Record<FormatToken, string> = {
	YYYY: '(\\d{4})',
	MM: '(\\d{1,2})',
	DD: '(\\d{1,2})',
	HH: '(\\d{1,2})',
	hh: '(\\d{1,2})',
	mm: '(\\d{1,2})',
	A: '(AM|PM)',
};

function escapeRegex(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isLeapYear(year: number): boolean {
	return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
	const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
	return days[month - 1];
}

export function isValidDateMatch(
	value: string,
	format: string,
	sourceText: string = value,
	startIndex: number = 0,
): boolean {
	const tokens: FormatToken[] = [];
	const tokenRegex = /YYYY|MM|DD|HH|hh|mm|A/g;
	let pattern = '^';
	let lastIndex = 0;
	let tokenMatch: RegExpExecArray | null;

	while ((tokenMatch = tokenRegex.exec(format)) !== null) {
		const token = tokenMatch[0] as FormatToken;
		let literal = format.slice(lastIndex, tokenMatch.index);

		// Existing date/time patterns intentionally allow an omitted space before AM/PM.
		if (token === 'A' && literal.endsWith(' ')) {
			literal = literal.slice(0, -1);
			pattern += `${escapeRegex(literal)}\\s*`;
		} else {
			pattern += escapeRegex(literal);
		}

		pattern += TOKEN_PATTERNS[token];
		tokens.push(token);
		lastIndex = tokenRegex.lastIndex;
	}

	pattern += `${escapeRegex(format.slice(lastIndex))}$`;
	const match = new RegExp(pattern, 'i').exec(value);
	if (!match) return false;

	const isDateOnlyFormat = !/(?:HH|hh|mm|A)/.test(format);
	const trailingText = sourceText.slice(startIndex + value.length);
	if (isDateOnlyFormat && /^[ 	]+\d{1,2}:\d{1,2}(?:[ 	]*[apm]{2})?/i.test(trailingText)) {
		return false;
	}

	const components: Partial<Record<FormatToken, string>> = {};
	tokens.forEach((token, index) => {
		components[token] = match[index + 1];
	});

	if (components.YYYY !== undefined) {
		const year = Number(components.YYYY);
		const month = Number(components.MM);
		const day = Number(components.DD);

		if (year < 1 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
			return false;
		}
	}

	if (components.HH !== undefined) {
		const hour = Number(components.HH);
		if (hour < 0 || hour > 23) return false;
	}

	if (components.hh !== undefined) {
		const hour = Number(components.hh);
		if (hour < 1 || hour > 12) return false;
	}

	if (components.mm !== undefined) {
		const minute = Number(components.mm);
		if (minute < 0 || minute > 59) return false;
	}

	return true;
}
