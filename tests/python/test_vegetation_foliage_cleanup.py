# Protects isolated foliage and crown extent while removing redundant overlapping blades.
import sys
import unittest
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'tools/bake_vegetation/enhanced_reference'))
from foliage_cleanup import clean_foliage


class CleanupTests(unittest.TestCase):
    def test_overlap_removed_without_erasing_unique_extent_or_volume(self):
        rng=np.random.default_rng(27)
        unique=rng.uniform(-2,2,(120,3));centers=np.concatenate([unique,unique[:80]+.002])
        matrices=np.repeat((np.eye(3)*.17)[None],len(centers),axis=0)
        groups=np.r_[np.arange(120)//20,np.arange(80)//20]
        policy={'maximumRemoval':.18,'minimumSprayRetention':.78,'minimumProjectedRetention':.975,'projectionCellMetres':.04,'volumeCellMetres':.5}
        keep,proof=clean_foliage(centers,matrices,groups,policy)
        self.assertGreater(proof['removedLeaves'],15)
        self.assertLess(proof['withinSprayCrowdingAfter'],proof['withinSprayCrowdingBefore'])
        for group in np.unique(groups):
            old=centers[groups==group];new=centers[(groups==group)&keep]
            np.testing.assert_array_equal(new.min(axis=0),old.min(axis=0));np.testing.assert_array_equal(new.max(axis=0),old.max(axis=0))
        self.assertEqual({tuple(v) for v in np.floor(centers/.5)},{tuple(v) for v in np.floor(centers[keep]/.5)})
        self.assertTrue(all(r['retainedFraction']>=.975 for r in proof['projectedCoverage']))
        self.assertTrue(np.all(keep[80:120]))
        np.testing.assert_array_equal(keep,clean_foliage(centers,matrices,groups,policy)[0])


if __name__=='__main__':unittest.main()
