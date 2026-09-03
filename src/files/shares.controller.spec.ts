import { SharesController } from './shares.controller';
import { SharesService } from './shares.service';

describe('SharesController', () => {
  const sharesServiceMock = { search: jest.fn() };

  function buildController() {
    return new SharesController(sharesServiceMock as unknown as SharesService);
  }

  beforeEach(() => jest.clearAllMocks());

  it('search delegates to sharesService.search with fileId, ownerId, and q', async () => {
    const controller = buildController();
    sharesServiceMock.search.mockResolvedValue([{ id: 'u2', name: 'Cara', email: 'c@x.com', avatarUrl: null }]);

    const result = await controller.search('f1', 'owner_1', 'car');

    expect(result).toEqual([{ id: 'u2', name: 'Cara', email: 'c@x.com', avatarUrl: null }]);
    expect(sharesServiceMock.search).toHaveBeenCalledWith('f1', 'owner_1', 'car');
  });
});
