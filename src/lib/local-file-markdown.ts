import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

export const LOCAL_FILE_REMARK_PLUGINS = [remarkGfm];
export const LOCAL_FILE_REHYPE_PLUGINS = [rehypeRaw, rehypeSanitize, rehypeHighlight];
