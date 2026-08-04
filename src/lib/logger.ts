/** Severities Cloud Logging understands. */
export type Severity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR';

export type LogFormat = 'json' | 'text';

export interface LogFields {
	/** Correlates entries belonging to one request. */
	trace?: string;
	[key: string]: unknown;
}

/**
 * Chooses the output format.
 *
 * Cloud Run sets K_SERVICE, and parses a JSON line there into severity, message
 * and trace fields — a plain line becomes an opaque string with severity guessed
 * from the stream it arrived on. Everywhere else, readable text is more useful
 * than JSON, so the format follows the environment unless LOG_FORMAT overrides
 * it.
 */
function detectFormat(): LogFormat {
	const explicit = process.env.LOG_FORMAT?.trim().toLowerCase();
	if (explicit === 'json' || explicit === 'text') return explicit;
	return process.env.K_SERVICE === undefined ? 'text' : 'json';
}

let format: LogFormat = detectFormat();

/** Overrides the detected format. Exposed for tests and for re-reading the env. */
export function setLogFormat(next?: LogFormat): LogFormat {
	format = next ?? detectFormat();
	return format;
}

export function getLogFormat(): LogFormat {
	return format;
}

/**
 * Builds the trace field Cloud Logging uses to group a request's entries.
 *
 * The header carries "TRACE_ID/SPAN_ID;o=1", and the field must name the
 * project, so correlation only works when the project is known. Without it the
 * bare id is still emitted, which is greppable even if not linked.
 */
export function traceFieldFrom(header: string | undefined): string | undefined {
	if (header === undefined) return undefined;

	const traceId = header.split('/')[0].trim();
	if (traceId === '') return undefined;

	const project = process.env.GOOGLE_CLOUD_PROJECT ?? process.env.GCLOUD_PROJECT;
	return project === undefined ? traceId : `projects/${project}/traces/${traceId}`;
}

/**
 * Writes one log entry.
 *
 * Warnings and errors go to stderr so that severity survives even when the
 * output is not parsed as JSON.
 */
export function log(severity: Severity, message: string, fields: LogFields = {}): void {
	const write =
		severity === 'ERROR' || severity === 'WARNING'
			? (line: string): void => console.error(line)
			: (line: string): void => console.log(line);

	if (format === 'text') {
		write(message);
		return;
	}

	const entry: Record<string, unknown> = { severity, message, ...fields };

	if (typeof fields.trace === 'string') {
		delete entry.trace;
		entry['logging.googleapis.com/trace'] = fields.trace;
	}

	write(JSON.stringify(entry));
}
