import { describe, expect, it } from 'vitest';
import { getServerSideProps } from '@/pages/viewer/local';

describe('local file viewer page', () => {
  it('redirects a cwd-relative path to its canonical absolute viewer URL', async () => {
    const result = await getServerSideProps({
      query: {
        path: '.env',
        base: '/Users/donghojo/workspace/aios',
      },
    } as never);

    expect(result).toEqual({
      redirect: {
        destination: '/viewer/local?path=%2FUsers%2Fdonghojo%2Fworkspace%2Faios%2F.env',
        permanent: false,
      },
    });
  });
});
